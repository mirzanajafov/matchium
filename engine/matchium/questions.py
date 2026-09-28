from dataclasses import dataclass

DIMENSIONS = (
    "social_energy",
    "adventure",
    "ambition",
    "family",
    "tidiness",
    "planning",
    "tradition",
    "activity",
)


@dataclass(frozen=True)
class Question:
    id: str
    dimension: int
    text: str
    noise: float
    reverse: bool = False


_STATEMENTS = {
    "social_energy": [
        ("A big party after a long week sounds energizing, not draining.", 0.5, False),
        ("I'd rather meet new people than spend the evening with close friends.", 0.7, False),
        ("I often start conversations with strangers.", 0.6, False),
        ("My ideal weekend has plans with other people on both days.", 0.8, False),
        ("I recharge by being alone, not by being around people.", 0.4, True),
        ("I enjoy being the center of attention in a group.", 0.9, False),
        ("I'd rather go to a crowded concert than a quiet dinner for two.", 0.6, False),
        ("I know most of my neighbors by name.", 0.8, False),
        ("After a day full of people I need a quiet evening to myself.", 0.5, True),
        ("I'm usually the one who suggests getting the group together.", 0.6, False),
        ("Small talk with people I've just met comes easily to me.", 0.5, False),
        ("I'd skip a party if I didn't know anyone there.", 0.6, True),
    ],
    "adventure": [
        ("I'd pick a trip to a country I know nothing about over a favorite familiar place.", 0.5, False),
        ("I like trying food I can't pronounce.", 0.8, False),
        ("A last-minute flight somewhere new sounds exciting, not stressful.", 0.6, False),
        ("I'd try skydiving at least once.", 0.9, False),
        ("Routine comforts me more than it bores me.", 0.5, True),
        ("I change hobbies often to try new things.", 0.7, False),
        ("I'd live abroad for a year just to see what it's like.", 0.5, False),
        ("Getting lost in a new city is part of the fun.", 0.7, False),
        ("I'd rather go back to a place I loved than risk a new one.", 0.6, True),
        ("I've done something this year I'd never done before.", 0.8, False),
        ("I'd choose a road trip with no fixed route over a planned tour.", 0.6, False),
        ("Extreme sports are not for me.", 0.7, True),
    ],
    "ambition": [
        ("I'd take a demanding job over a relaxed one if it meant faster growth.", 0.5, False),
        ("I often think about where my career will be in ten years.", 0.6, False),
        ("Working evenings on something I care about feels normal to me.", 0.7, False),
        ("Success at work is a big part of who I am.", 0.4, False),
        ("I'd move to another city for the right career opportunity.", 0.8, False),
        ("I'm happy with a stable job that just pays the bills.", 0.6, True),
        ("I set goals for myself every year and track them.", 0.6, False),
        ("I'd start my own business if I had the chance.", 0.7, False),
        ("Earning a lot of money matters to me.", 0.5, False),
        ("I'd turn down a promotion if it meant less free time.", 0.5, True),
        ("I spend free time learning skills that help my career.", 0.7, False),
        ("I measure a good year mostly by what I achieved at work.", 0.6, False),
    ],
    "family": [
        ("I want to have children someday.", 0.4, False),
        ("I'd like to live close to my parents.", 0.7, False),
        ("Big family gatherings are something I look forward to.", 0.6, False),
        ("Starting a family is one of my top life goals.", 0.4, False),
        ("I'd be happy with a life without kids.", 0.5, True),
        ("Family opinion matters when I make big decisions.", 0.8, False),
        ("I call my parents or siblings several times a week.", 0.7, False),
        ("I'd want more than two children.", 0.6, False),
        ("I picture my future home with room for visiting relatives.", 0.8, False),
        ("I'd move far from my family if life took me there.", 0.6, True),
        ("Holidays are for family first, friends second.", 0.6, False),
        ("Having kids isn't something I think about much.", 0.5, True),
    ],
    "tidiness": [
        ("A messy room makes it hard for me to relax.", 0.5, False),
        ("Dishes should be washed the same day.", 0.6, False),
        ("I make my bed every morning.", 0.7, False),
        ("I notice when things at home are out of place.", 0.6, False),
        ("A little chaos at home doesn't bother me.", 0.5, True),
        ("I clean even when nobody is coming over.", 0.9, False),
        ("Everything in my home has a place it goes back to.", 0.6, False),
        ("Clothes on a chair are fine until the weekend.", 0.6, True),
        ("I tidy up before I go to bed.", 0.7, False),
        ("A clean kitchen is a must before I start cooking.", 0.7, False),
        ("I'd rather pay for a cleaner than argue about chores.", 0.9, False),
        ("I don't really notice clutter.", 0.5, True),
    ],
    "planning": [
        ("I like having my week planned in advance.", 0.5, False),
        ("I book vacations months ahead.", 0.7, False),
        ("Spontaneous plans on a free evening annoy me more than they excite me.", 0.8, False),
        ("I keep a to-do list or calendar for my personal life.", 0.6, False),
        ("I'm usually on time or early.", 0.8, False),
        ("I prefer to decide things in the moment.", 0.5, True),
        ("I know what I'm doing next weekend already.", 0.5, False),
        ("I save money with a plan, not with whatever is left.", 0.7, False),
        ("I pack for a trip the day before, not the hour before.", 0.7, False),
        ("I like to leave weekends open and see what happens.", 0.5, True),
        ("When I travel I have a rough plan for every day.", 0.6, False),
        ("Changes to plans at the last minute stress me out.", 0.7, False),
    ],
    "tradition": [
        ("Traditional roles in a relationship make sense to me.", 0.5, False),
        ("Religious or cultural traditions are important in my daily life.", 0.4, False),
        ("Marriage should come before living together.", 0.5, False),
        ("I celebrate holidays the way my family always has.", 0.7, False),
        ("Couples should follow their own rules, not society's.", 0.6, True),
        ("I'd want my partner to share my cultural background.", 0.8, False),
        ("Religion will play a role in how I raise my children.", 0.5, False),
        ("I'd want a traditional wedding.", 0.6, False),
        ("My parents' approval of my partner matters to me.", 0.6, False),
        ("Old customs should change when they no longer fit.", 0.6, True),
        ("I follow the rituals and fasts of my faith or culture.", 0.5, False),
        ("I'd be fine with a partner from a very different background.", 0.6, True),
    ],
    "activity": [
        ("I work out at least three times a week.", 0.4, False),
        ("A hiking day beats a movie marathon.", 0.6, False),
        ("I get restless if I stay home all weekend.", 0.7, False),
        ("I pay attention to what I eat for health reasons.", 0.8, False),
        ("I'd rather walk than take a taxi for short distances.", 0.9, False),
        ("A lazy day on the couch is my favorite way to spend a Sunday.", 0.5, True),
        ("I plan my week around sport or training.", 0.5, False),
        ("I'd pick an active holiday over a beach resort.", 0.6, False),
        ("I take the stairs instead of the lift.", 0.9, False),
        ("I'd like a partner I can train or play sports with.", 0.6, False),
        ("Exercise feels like a chore to me.", 0.5, True),
        ("I've signed up for a race, match or tournament in the last year.", 0.7, False),
    ],
}


def load_bank() -> list[Question]:
    bank = []
    for dim_index, dim in enumerate(DIMENSIONS):
        for i, (text, noise, reverse) in enumerate(_STATEMENTS[dim]):
            bank.append(Question(f"{dim}.{i + 1}", dim_index, text, noise, reverse))
    return bank
