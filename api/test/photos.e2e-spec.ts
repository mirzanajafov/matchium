import sharp from 'sharp';
import { clock, http, photos, prisma, useTestApp, waitForLockWaits } from './support/app.js';
import { as, createMatch, man, register, registerAdmin, woman } from './support/builders.js';

useTestApp();

describe('photos and bio', () => {
  const jpeg = () =>
    sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#8a6' } })
      .withExif({ IFD0: { Make: 'PhoneCo' } })
      .jpeg()
      .toBuffer();

  async function upload(token: string) {
    return http()
      .post('/me/photos')
      .set(as(token))
      .attach('photo', await jpeg(), 'me.jpg');
  }

  it('stores a cleaned-up copy and lists it on the profile', async () => {
    const alice = await register();
    const res = await upload(alice.token);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ width: 1080, height: 810 });

    const me = await http().get('/me').set(as(alice.token)).expect(200);
    expect(me.body.photos).toEqual([{ id: res.body.id, width: 1080, height: 810 }]);
    const [stored] = [...photos.objects.values()];
    expect((await sharp(stored!).metadata()).exif).toBeUndefined();

    const image = await http().get(`/photos/${res.body.id}`).set(as(alice.token)).buffer(true).expect(200);
    expect(image.headers['content-type']).toBe('image/webp');
    expect(image.headers['cache-control']).toBe('private, max-age=3600');
  });

  it('rejects junk and caps the number of photos', async () => {
    const alice = await register();
    await http().post('/me/photos').set(as(alice.token)).attach('photo', Buffer.from('nope'), 'x.jpg').expect(400);
    await http().post('/me/photos').set(as(alice.token)).expect(400);
    for (let i = 0; i < 4; i += 1) expect((await upload(alice.token)).status).toBe(201);
    expect((await upload(alice.token)).status).toBe(409);
  });

  it('keeps the cap and one photo per place when uploads arrive together', async () => {
    const alice = await register();
    const statuses = await Promise.all(Array.from({ length: 6 }, async () => (await upload(alice.token)).status));
    expect(statuses.filter((status) => status === 201)).toHaveLength(4);
    expect(statuses.filter((status) => status === 409)).toHaveLength(2);
    const stored = await prisma.photo.findMany({ where: { userId: alice.id }, orderBy: { position: 'asc' } });
    expect(stored.map((photo) => photo.position)).toEqual([0, 1, 2, 3]);
    expect(photos.objects.size).toBe(4);
  });

  it('keeps the 409 and the 204 when storage refuses to delete', async () => {
    const alice = await register();
    const ids: string[] = [];
    for (let i = 0; i < 4; i += 1) ids.push((await upload(alice.token)).body.id);
    photos.refuseDeletes = true;
    expect((await upload(alice.token)).status).toBe(409);
    await http().delete(`/me/photos/${ids[0]}`).set(as(alice.token)).expect(204);
    expect(await prisma.photo.count({ where: { userId: alice.id } })).toBe(3);
  });

  it('shows photos only to people you are matched with', async () => {
    const alice = await woman('Alice');
    const bob = await man('Bob');
    const stranger = await register();
    const admin = await registerAdmin();
    const { id } = (await upload(alice.token)).body;
    await http()
      .patch('/me/profile')
      .set(as(alice.token))
      .send({ bio: '  Climbing, bad puns, good coffee.  ' })
      .expect(200);

    await http().get(`/photos/${id}`).set(as(bob.token)).expect(404);
    const match = await createMatch(alice, bob);
    await http().get(`/photos/${id}`).set(as(bob.token)).expect(200);
    await http().get(`/photos/${id}`).set(as(stranger.token)).expect(404);
    await http().get(`/photos/${id}`).set(as(admin.token)).expect(200);

    const today = await http().get('/matches/today').set(as(bob.token)).expect(200);
    expect(today.body.matches[0].person).toMatchObject({ bio: 'Climbing, bad puns, good coffee.', photos: [{ id }] });

    await http().post(`/matches/${match.id}/unmatch`).set(as(bob.token)).send({}).expect(200);
    await http().get(`/photos/${id}`).set(as(bob.token)).expect(404);
  });

  it('shows photos for the day of a match, and after it only if both said yes', async () => {
    const alice = await woman('Alice');
    const [bob, carl, dan, eve] = [await register(), await register(), await register(), await register()];
    const { id } = (await upload(alice.token)).body;
    const bobs = (await upload(bob.token)).body.id as string;
    const decide = (token: string, matchId: string, like: boolean) =>
      http().post(`/matches/${matchId}/decision`).set(as(token)).send({ like }).expect(200);
    const passed = await createMatch(alice, bob);
    const mutual = await createMatch(alice, carl);
    await createMatch(alice, dan);
    const oneSided = await createMatch(alice, eve);

    await decide(bob.token, passed.id, false);
    await decide(alice.token, mutual.id, true);
    await decide(carl.token, mutual.id, true);
    await decide(eve.token, oneSided.id, true);
    for (const viewer of [bob, carl, dan, eve]) await http().get(`/photos/${id}`).set(as(viewer.token)).expect(200);
    await http().get(`/photos/${bobs}`).set(as(alice.token)).expect(200);

    clock.nextDay();
    await http().get(`/photos/${id}`).set(as(carl.token)).expect(200);
    for (const viewer of [bob, dan, eve]) await http().get(`/photos/${id}`).set(as(viewer.token)).expect(404);
    await http().get(`/photos/${bobs}`).set(as(alice.token)).expect(404);

    await http().post(`/matches/${mutual.id}/unmatch`).set(as(carl.token)).send({}).expect(200);
    await http().get(`/photos/${id}`).set(as(carl.token)).expect(404);
  });

  it('keeps upload order, lets you pick the main photo and closes gaps after a delete', async () => {
    const alice = await register();
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) ids.push((await upload(alice.token)).body.id);
    const order = async () =>
      (await http().get('/me').set(as(alice.token)).expect(200)).body.photos.map((p: { id: string }) => p.id);
    expect(await order()).toEqual(ids);

    await http().post(`/me/photos/${ids[2]}/main`).set(as(alice.token)).expect(204);
    expect(await order()).toEqual([ids[2], ids[0], ids[1]]);

    await http().delete(`/me/photos/${ids[0]}`).set(as(alice.token)).expect(204);
    expect(await order()).toEqual([ids[2], ids[1]]);
    const positions = await prisma.photo.findMany({ where: { userId: alice.id }, orderBy: { position: 'asc' } });
    expect(positions.map((p) => p.position)).toEqual([0, 1]);

    const bob = await register();
    await http().post(`/me/photos/${ids[1]}/main`).set(as(bob.token)).expect(404);
  });

  it('cleans up the photo of an upload that lands while the account is being deleted', async () => {
    const alice = await register();
    await upload(alice.token);
    let land: () => void = () => undefined;
    const landing = new Promise<void>((resolve) => {
      land = resolve;
    });
    const inFlight = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${alice.id}::uuid FOR NO KEY UPDATE`;
      await tx.photo.create({ data: { userId: alice.id, key: 'late.webp', width: 10, height: 10, position: 1 } });
      photos.objects.set('late.webp', Buffer.from('late'));
      await landing;
    });

    const deleting = http()
      .delete('/me')
      .set(as(alice.token))
      .send({ password: 'correct horse battery' })
      .then((response) => response.status);
    await waitForLockWaits(1);
    land();
    await inFlight;

    expect(await deleting).toBe(204);
    expect([...photos.objects.keys()]).toEqual([]);
  });

  it('deletes photos, rejects long bios and cleans storage when the account goes', async () => {
    const alice = await register();
    const first = (await upload(alice.token)).body.id;
    await upload(alice.token);
    await http().delete(`/me/photos/${first}`).set(as(alice.token)).expect(204);
    await http().delete(`/me/photos/${first}`).set(as(alice.token)).expect(404);
    expect(photos.objects.size).toBe(1);
    await http()
      .patch('/me/profile')
      .set(as(alice.token))
      .send({ bio: 'x'.repeat(301) })
      .expect(400);

    await http().delete('/me').set(as(alice.token)).send({ password: 'correct horse battery' }).expect(204);
    expect(photos.objects.size).toBe(0);
  });
});
