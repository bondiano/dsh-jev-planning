/**
 * Machine tests for `@local/dsh-jev-planning`: the legal lifecycle, the
 * invalidation walk-backs, the judge availability flip and illegal transitions,
 * plus the session-evidence projection `stageOf` runs on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialValue, nextValue, jevPlanReviewMachine } from '../lib/plan-review.machine.js';
import { __test } from '../index.js';
const { freshState, registerTask, stageOf } = __test;
test('initial value matches the documented model', () => {
    assert.equal(jevPlanReviewMachine.id, 'jevPlanReview');
    assert.deepEqual(initialValue(), { planning: 'requirements', judge: 'available' });
});
test('plan review lifecycle walks the legal order', () => {
    let value = initialValue();
    assert.equal(nextValue(value, 'REQUIREMENTS_APPROVED').planning, 'outline');
    value = nextValue(value, 'REQUIREMENTS_APPROVED');
    value = nextValue(value, 'OUTLINE_APPROVED');
    assert.equal(value.planning, 'detail');
    value = nextValue(value, 'DETAIL_APPROVED');
    assert.equal(value.planning, 'detail');
    value = nextValue(value, 'ALL_DETAILS_APPROVED');
    assert.equal(value.planning, 'finalize');
    value = nextValue(value, 'FINAL_APPROVED');
    assert.equal(value.planning, 'approved');
});
test('invalidation events walk the stage back', () => {
    let value = initialValue();
    for (const event of ['REQUIREMENTS_APPROVED', 'OUTLINE_APPROVED', 'ALL_DETAILS_APPROVED']) {
        value = nextValue(value, event);
    }
    assert.equal(nextValue(value, 'DETAIL_STALE').planning, 'detail');
    value = nextValue(value, 'DETAIL_STALE');
    assert.equal(nextValue(value, 'OUTLINE_CHANGED').planning, 'outline');
    value = nextValue(value, 'OUTLINE_CHANGED');
    assert.equal(nextValue(value, 'REQUIREMENTS_CHANGED').planning, 'requirements');
    let fresh = initialValue();
    fresh = nextValue(fresh, 'REQUIREMENTS_APPROVED');
    assert.equal(nextValue(fresh, 'TASK_CHANGED').planning, 'requirements');
});
test('judge region flips on availability and recovery', () => {
    let value = initialValue();
    value = nextValue(value, 'JUDGE_UNAVAILABLE');
    assert.equal(value.judge, 'unavailable');
    value = nextValue(value, 'JUDGE_STILL_UNAVAILABLE');
    assert.equal(value.judge, 'unavailable');
    value = nextValue(value, 'JUDGE_RECOVERED');
    assert.equal(value.judge, 'available');
});
test('illegal transitions throw', () => {
    assert.throws(() => nextValue(initialValue(), 'OUTLINE_APPROVED'), /illegal plan review transition/);
    assert.throws(() => nextValue(initialValue(), 'FINAL_APPROVED'), /illegal plan review transition/);
    assert.throws(() => nextValue({ planning: 'outline', judge: 'unavailable' }, 'JUDGE_UNAVAILABLE'), /illegal plan review transition/);
});
test('stageOf projects session evidence through the machine', () => {
    const state = freshState();
    state.task = { fingerprint: 'f', request: 'r' };
    assert.equal(stageOf(state), 'requirements');
    state.requirements = { taskFingerprint: 'f', items: ['a'] };
    assert.equal(stageOf(state), 'outline');
    state.planDraft = { taskFingerprint: 'f', requirementsDigest: 'd', steps: [{ id: 's1', summary: 'u', requirement: 'a' }, { id: 's2', summary: 'v', requirement: 'a' }], outlineApproved: true, details: [] };
    assert.equal(stageOf(state), 'detail');
    state.planDraft.details = [{ id: 's1', requirement: 'a', section: 's1 section', paths: ['src/one.js'] }];
    assert.equal(stageOf(state), 'detail');
    state.planDraft.details = [{ id: 's1', requirement: 'a', section: 's1 section', paths: ['src/one.js'] }, { id: 's2', requirement: 'a', section: 's2 section', paths: ['src/two.js'] }];
    assert.equal(stageOf(state), 'finalize');
    state.plan = { taskFingerprint: 'f', planPath: 'plan/x.md', planDigest: 'x', confidence: 1 };
    assert.equal(stageOf(state), 'finalize');
});
test('new task text clears every approval and restarts planning', () => {
    const state = freshState();
    registerTask(state, 'first request');
    state.requirements = { taskFingerprint: state.task.fingerprint, items: ['a'] };
    state.planDraft = { taskFingerprint: state.task.fingerprint, requirementsDigest: 'd', steps: [{ id: 's1', summary: 'u', requirement: 'a' }], outlineApproved: true, details: [{ id: 's1', requirement: 'a', section: 's1 section', paths: ['src/one.js'] }] };
    state.plan = { taskFingerprint: state.task.fingerprint, planPath: 'plan/x.md', planDigest: 'x', confidence: 1 };
    const priorFingerprint = state.requirements.taskFingerprint;
    const task = registerTask(state, 'a different request');
    assert.notEqual(task.fingerprint, priorFingerprint);
    assert.equal(state.requirements, undefined);
    assert.equal(state.planDraft, undefined);
    assert.equal(state.plan, undefined);
    assert.equal(stageOf(state), 'requirements');
});
