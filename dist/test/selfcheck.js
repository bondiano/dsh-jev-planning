/**
 * Offline self-check for `@local/dsh-jev-planning`.
 *
 * Runs the real plugin against a stub System One endpoint (reached through the
 * TypeSafe provider, whose base URL is configurable) and a stub Session, so the
 * whole workflow — requirements, outline, detail, finalize, the gate — is
 * exercised without external credentials or network access.
 */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const failures = [];
const checks = [];
const cwd = await mkdtemp(join(tmpdir(), 'jev-selfcheck-'));
const planDir = 'plan';
const planPath = `${planDir}/feature.md`;
await mkdir(join(cwd, planDir), { recursive: true });
/** Answer every submitted question with the approving, confident answer. */
const server = createServer((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
        const payload = JSON.parse(body);
        const answers = {};
        for (const [name, question] of Object.entries(payload.questions)) {
            if (question.type === 'noul')
                answers[name] = { type: 'noul', noul: 0.9 };
            else if (question.type === 'choice')
                answers[name] = { type: 'choice', choice: Object.keys(question.criteria)[0], confidence: 0.9 };
            else
                answers[name] = { type: 'score', score: 0, confidence: 0.9 };
        }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ model: 'stub-jev', answers }));
    });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve()));
const port = server.address().port;
process.env.TYPESAFE_BASE_URL = `http://127.0.0.1:${port}`;
// The key comes from the DSH credential store, not the environment, so the
// provider chain's credential fallback is exercised end to end.
delete process.env.TYPESAFE_API_KEY;
delete process.env.OPENCODE_API_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.OPENCODE_API_KEY_COMMAND;
delete process.env.OPENROUTER_API_KEY_COMMAND;
delete process.env.TYPESAFE_API_KEY_COMMAND;
const { apply, __test } = await import('../dist/index.js');
/** One recorded registration. */
const registered = [];
const ctx = {
    effect: (fn) => { fn(); return () => { }; },
    tools: {
        register: (definition) => { registered.push({ kind: 'tool', definition }); return () => { }; },
        guard: (guard) => { registered.push({ kind: 'guard', guard }); return () => { }; },
    },
    systemPrompt: { section: (section) => { registered.push({ kind: 'section', section }); return () => { }; } },
    get: (name) => {
        if (name === 'commands')
            return { register: (definition) => { registered.push({ kind: 'command', definition }); return () => { }; } };
        if (name === 'credentials') {
            return {
                resolve: async (ref) => (ref === 'TYPESAFE_API_KEY' ? { value: 'stub-key', source: 'test-store' } : ref === 'BLANK_KEY' ? { value: '  ', source: 'test-store' } : undefined),
            };
        }
        return undefined;
    },
    on: (name, listener) => { registered.push({ kind: 'event', name, listener }); return () => { }; },
};
apply(ctx, { planDir, gateMutation: true });
const agent = { id: 'selfcheck-session', session: { header: { cwd } } };
const tool = name => registered.find(entry => entry.kind === 'tool' && entry.definition.name === name).definition;
const guard = registered.find(entry => entry.kind === 'guard').guard;
const preExecute = registered.find(entry => entry.kind === 'event' && entry.name === 'tools/pre-execute').listener;
const run = async (name, args) => {
    const result = await tool(name).execute(args, { agent });
    return result.text;
};
/**
 * Record one expectation.
 * @param label - what is being checked.
 * @param condition - the observed truth.
 * @param detail - observed value printed on failure.
 */
function check(label, condition, detail = '') {
    checks.push(label);
    if (!condition)
        failures.push(`${label}${detail === '' ? '' : ` — ${detail}`}`);
}
// Registrations -----------------------------------------------------------------
check('three tools registered', ['jev_consult', 'jev_requirements', 'jev_plan_review'].every(name => registered.some(entry => entry.kind === 'tool' && entry.definition.name === name)));
check('mutation guard registered', registered.some(entry => entry.kind === 'guard'));
check('pre-execute listener registered', registered.some(entry => entry.kind === 'event' && entry.name === 'tools/pre-execute'));
check('protocol section registered', registered.some(entry => entry.kind === 'section' && entry.section.name === 'jev:planning-protocol'));
check('status command registered', registered.some(entry => entry.kind === 'command' && entry.definition.name === 'jev'));
// Helpers -----------------------------------------------------------------------
check('git status is read-only', __test.commandIsReadOnly('git status --short'));
check('ls pipe rg is read-only', __test.commandIsReadOnly('ls -la | rg plan'));
check('2>/dev/null discard is read-only', __test.commandIsReadOnly('git log -3 2>/dev/null'));
check('redirect is consequential', !__test.commandIsReadOnly('echo hi > src/a.js'));
check('rm is consequential', !__test.commandIsReadOnly('rm -rf src'));
check('git commit is consequential', !__test.commandIsReadOnly('git commit -m x'));
check('sed -i is consequential', !__test.commandIsReadOnly('sed -i s/a/b/ src/a.js'));
check('absolute path inside plan dir resolves', __test.resolvePlanPath(cwd, planDir, join(cwd, planPath))?.relative === planPath);
check('parent escape does not resolve', __test.resolvePlanPath(cwd, planDir, `${planDir}/../x.md`) === undefined);
check('non-markdown does not resolve', __test.resolvePlanPath(cwd, planDir, `${planDir}/x.txt`) === undefined);
// Stage one: requirements -------------------------------------------------------
const requirements = await run('jev_requirements', {
    request: 'Add a typed lookup and expose it on the CLI.',
    items: [
        { text: 'The store lookup throws a typed error for a missing key.', source: 'Add a typed lookup' },
        { text: 'The CLI exposes the lookup behind a documented flag.', source: 'expose it on the CLI' },
    ],
    evidence: [{ kind: 'user', quote: 'Add a typed lookup and expose it on the CLI.' }],
});
check('requirements approved', requirements.includes('Requirements approved'), requirements);
check('requirements stage reported', requirements.includes('stage: requirements'), requirements);
// Gate while no plan exists -----------------------------------------------------
check('write outside the artifact is held', guard({ name: 'write', arguments: { file_path: 'src/a.js' }, agent }) !== undefined);
check('read is allowed', guard({ name: 'read', arguments: { file_path: 'src/a.js' }, agent }) === undefined);
check('artifact write is allowed', guard({ name: 'write', arguments: { file_path: planPath }, agent }) === undefined);
check('mkdir of the artifact dir is allowed', guard({ name: 'bash', arguments: { command: `mkdir -p ${planDir}` }, agent }) === undefined);
check('mutating bash is held', guard({ name: 'bash', arguments: { command: 'rm -rf src' }, agent }) !== undefined);
check('read-only bash is allowed', guard({ name: 'bash', arguments: { command: 'git status' }, agent }) === undefined);
// Stage two: outline ------------------------------------------------------------
const outline = await run('jev_plan_review', {
    phase: 'outline',
    steps: [
        { id: 'lookup', summary: 'Throw a typed error from the store lookup.', requirement: 'The store lookup throws a typed error for a missing key.' },
        { id: 'flag', summary: 'Wire the documented CLI flag to the lookup.', requirement: 'The CLI exposes the lookup behind a documented flag.' },
    ],
    evidence: [{ kind: 'spec', quote: 'Add a typed lookup and expose it on the CLI.' }],
});
check('outline approved', outline.includes('plan outline approved'), outline);
// Stage three: detail -----------------------------------------------------------
const artifact = [
    '# Feature plan',
    '',
    '## lookup',
    '',
    'Add `Store.lookup` in src/store.js that throws `MissingKeyError` when the key is absent, keeping the existing signature.',
    'Check: `node --test test/store.test.js` covers the missing-key case and passes.',
    '',
    '## flag',
    '',
    'Register `--lookup <key>` in src/cli.js, pass it to `Store.lookup` and print the value on one line.',
    'Check: `node bin/cli.js --help` lists the flag, and `--lookup missing` prints the typed error.',
    '',
].join('\n');
await writeFile(join(cwd, planPath), artifact, 'utf8');
const detailOne = await run('jev_plan_review', {
    phase: 'detail', plan: planPath,
    topic: { id: 'lookup', section: 'lookup', requirement: 'The store lookup throws a typed error for a missing key.', paths: ['src/store.js'] },
    evidence: [{ kind: 'code', quote: 'throw new MissingKeyError(key)' }],
});
check('first detail approved', detailOne.includes("detail approved for 'lookup'"), detailOne);
const detailTwo = await run('jev_plan_review', {
    phase: 'detail', plan: planPath,
    topic: { id: 'flag', section: 'flag', requirement: 'The CLI exposes the lookup behind a documented flag.', paths: ['src/cli.js'] },
    evidence: [{ kind: 'code', quote: '--lookup <key>' }],
});
check('second detail approved', detailTwo.includes("detail approved for 'flag'"), detailTwo);
// Stage four: finalize ----------------------------------------------------------
const final = await run('jev_plan_review', {
    phase: 'finalize', plan: planPath,
    evidence: [{ kind: 'documentation', quote: artifact.slice(0, 60) }],
});
check('final plan approved', final.includes('plan approved after outline, detail and assembly'), final);
check('gate opens after approval', guard({ name: 'write', arguments: { file_path: 'src/a.js' }, agent }) === undefined);
check('pre-execute allows an unchanged artifact', (await preExecute({ name: 'write', arguments: { file_path: 'src/a.js' }, agent }, async () => ({ kind: 'allow' }))).kind === 'allow');
// Stale artifact closes the gate ------------------------------------------------
await writeFile(join(cwd, planPath), `${artifact}\n## extra\n\nUnplanned scope.\n`, 'utf8');
const afterChange = await preExecute({ name: 'write', arguments: { file_path: 'src/a.js' }, agent }, async () => ({ kind: 'allow' }));
check('pre-execute denies a changed artifact', afterChange.kind === 'deny', JSON.stringify(afterChange));
check('gate closes after the artifact changed', guard({ name: 'write', arguments: { file_path: 'src/a.js' }, agent }) !== undefined);
// Consult -----------------------------------------------------------------------
const consult = await run('jev_consult', {
    context: 'Two storage designs are on the table.',
    question: 'Which storage design should the lookup use?',
    mode: 'choice',
    alternatives: [
        { label: 'map', meaning: 'An in-memory map, simplest to verify.' },
        { label: 'sqlite', meaning: 'A durable SQLite table.' },
    ],
    evidence: [{ kind: 'spec', quote: 'Add a typed lookup' }],
});
check('consult returns the selected alternative', consult.includes('consult (choice): map'), consult);
// Status report -----------------------------------------------------------------
const status = registered.find(entry => entry.kind === 'command').definition.handler({ rawInput: 'status', agent });
check('status reports the stage', status.kind === 'success' && status.text.includes('stage:'), JSON.stringify(status));
check('status reports the refused boundary', status.text.includes('refusals'), status.text);
server.close();
await rm(cwd, { recursive: true, force: true });
if (failures.length > 0) {
    console.error(`FAILED ${failures.length}/${checks.length}`);
    for (const failure of failures)
        console.error(`- ${failure}`);
    process.exitCode = 1;
}
else {
    console.log(`ok: ${checks.length} checks passed`);
}
