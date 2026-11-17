/**
 * Per-session plan review state (index.ts).
 *
 * `stageOf` projects the session's surviving approval evidence through this
 * machine: requirements -> outline -> detail -> finalize, where approval of the
 * final artifact is the only terminal success. Invalidation (new task text,
 * changed requirements, changed outline, stale detail sections) is data-driven
 * in the session record, so withdrawn evidence simply stops being replayed.
 * The judge-health region tracks the availability flip of the
 * three-consecutive-availability-error rule.
 */
import { createMachine, initialTransition, transition } from 'xstate';
export const jevPlanReviewMachine = createMachine({
    id: 'jevPlanReview',
    type: 'parallel',
    description: 'Jev plan review: ordered planning stages plus live judge availability.',
    states: {
        planning: {
            initial: 'requirements',
            states: {
                requirements: {
                    on: {
                        REQUIREMENTS_APPROVED: 'outline',
                        REFUSED: 'requirements',
                        TASK_CHANGED: 'requirements',
                    },
                },
                outline: {
                    on: {
                        OUTLINE_APPROVED: 'detail',
                        REFUSED: 'outline',
                        REQUIREMENTS_CHANGED: 'requirements',
                        TASK_CHANGED: 'requirements',
                    },
                },
                detail: {
                    on: {
                        DETAIL_APPROVED: 'detail',
                        REFUSED: 'detail',
                        ALL_DETAILS_APPROVED: 'finalize',
                        DETAIL_STALE: 'detail',
                        OUTLINE_CHANGED: 'outline',
                        TASK_CHANGED: 'requirements',
                    },
                },
                finalize: {
                    on: {
                        FINAL_APPROVED: 'approved',
                        REFUSED: 'finalize',
                        DETAIL_STALE: 'detail',
                        TASK_CHANGED: 'requirements',
                    },
                },
                approved: { type: 'final' },
            },
        },
        judge: {
            initial: 'available',
            states: {
                available: { on: { JUDGE_UNAVAILABLE: 'unavailable' } },
                unavailable: {
                    on: {
                        JUDGE_RECOVERED: 'available',
                        JUDGE_STILL_UNAVAILABLE: 'unavailable',
                    },
                },
            },
        },
    },
});
/** The machine value of a brand-new session. */
export function initialValue() {
    return initialTransition(jevPlanReviewMachine)[0].value;
}
/**
 * Apply one event, refusing illegal transitions loudly.
 * @param value current parallel machine value.
 * @param event event type or event object.
 * @returns the next machine value.
 */
export function nextValue(value, event) {
    const eventObject = typeof event === 'string' ? { type: event } : event;
    const snapshot = jevPlanReviewMachine.resolveState({ value });
    if (!snapshot.can(eventObject)) {
        throw new Error(`illegal plan review transition: ${JSON.stringify(value)} --${eventObject.type}-->`);
    }
    return transition(jevPlanReviewMachine, snapshot, eventObject)[0].value;
}
