// Shared one local inference slot and a process-wide attempt budget across AI features.
function createInferenceBudget(now = Date.now) {
  let active = false;
  let started = now();
  let attempts = 0;
  return {
    acquire() {
      const time = now();
      if (time - started >= 60000 || time < started) {
        started = time;
        attempts = 0;
      }
      if (active || attempts >= 30) return null;
      active = true;
      attempts++;
      let released = false;
      return () => {
        // Released a lease once, including timeout, disconnect, and validation-failure paths.
        if (!released) {
          released = true;
          active = false;
        }
      };
    },
  };
}
module.exports = { createInferenceBudget };
