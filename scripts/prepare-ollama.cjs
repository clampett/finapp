const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const { coachModel, ollamaOrigin } = require('../frontend/coach-service');

const composeFile = resolve(__dirname, '../docker-compose.yml');

async function readModels(request, signal) {
  try {
    const response = await request(`${ollamaOrigin}/api/tags`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]),
      redirect: 'error',
    });
    if (!response.ok) return null;
    const body = await response.json();
    return Array.isArray(body.models) ? body.models : null;
  } catch {
    return null;
  }
}

function startContainer(signal) {
  return new Promise((resolveStart, reject) => {
    const child = spawn(
      'docker',
      ['compose', '-f', composeFile, 'up', '-d', '--pull', 'missing', 'ollama'],
      {
        stdio: 'inherit',
        windowsHide: true,
        signal: AbortSignal.any([signal, AbortSignal.timeout(20 * 60 * 1000)]),
      },
    );
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolveStart();
      else reject(new Error('Docker could not start Ollama.'));
    });
  });
}

async function prepareOllama({
  request = fetch,
  start = startContainer,
  pause = sleep,
  log = console.log,
  signal = new AbortController().signal,
} = {}) {
  // Reused a running local runtime and downloaded the model only when absent.
  let models = await readModels(request, signal);
  if (!models) {
    log('Preparing the Ollama container. The first run downloads the runtime and model.');
    signal.throwIfAborted();
    await start(signal);
    for (let attempt = 0; attempt < 30 && !models; attempt++) {
      models = await readModels(request, signal);
      if (!models) await pause(1000, undefined, { signal });
    }
    if (!models) throw new Error('Ollama did not become ready on port 11434.');
  }

  if (!models.some((item) => item?.name === coachModel)) {
    log(`Downloading ${coachModel}. FinApp can be used while the model downloads.`);
    const response = await request(`${ollamaOrigin}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: coachModel, stream: false }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(20 * 60 * 1000)]),
      redirect: 'error',
    });
    if (!response.ok || (await response.json()).status !== 'success') {
      throw new Error('Ollama could not download the model.');
    }
    const updated = await readModels(request, signal);
    if (!updated?.some((item) => item?.name === coachModel)) {
      throw new Error('The downloaded model was not available.');
    }
  }

  log('Local AI is ready. Open AI Coach to ask FinApp.');
}

if (require.main === module) {
  const controller = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => controller.abort());
  }
  prepareOllama({ signal: controller.signal }).catch((error) => {
    if (controller.signal.aborted) return;
    console.error(
      `Local AI setup did not finish: ${error.message} FinApp will use the built-in guide.`,
    );
    process.exitCode = 1;
  });
}

module.exports = { prepareOllama };
