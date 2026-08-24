/**
 * Thrown by any integration stub that has not been implemented yet.
 * Used instead of a mocked/fake success path so Phase 1 code never
 * pretends a real integration is working.
 */
export class NotImplementedError extends Error {
  constructor(feature: string, plannedPhase?: string) {
    super(
      `${feature} is not implemented yet.${
        plannedPhase ? ` Planned for ${plannedPhase}.` : ""
      }`,
    );
    this.name = "NotImplementedError";
  }
}
