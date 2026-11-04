export type DemoStep = "answered";

export function reportStep(step: DemoStep): void {
  document.dispatchEvent(new CustomEvent("najafov:action", { detail: step }));
}
