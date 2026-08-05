const { createRemoteCommandExecutor } = require("./commandHandlers");

function createRemoteCommandPoller({ bridgeUrl, handlers, ui }) {
  let commandPollInFlight = false;
  const executeRemoteCommand = createRemoteCommandExecutor(handlers);

  async function reportResult(commandId, outcome) {
    await fetch(`${bridgeUrl}/commands/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: commandId, ...outcome }),
    });
  }

  async function pollRemoteCommands() {
    if (commandPollInFlight) return;
    commandPollInFlight = true;
    try {
      const response = await fetch(`${bridgeUrl}/commands/next`);
      if (!response.ok) return;
      const command = await response.json();
      if (!command?.id || !command?.command) return;
      ui.statusElement.textContent = `RHV remote command: ${command.command}`;
      try {
        await reportResult(command.id, await executeRemoteCommand(command));
      } catch (error) {
        console.error("RHV remote command failed", error);
        await reportResult(command.id, { ok: false, error: error?.message || String(error) });
      }
    } catch {
      // The bridge may be restarting; the next poll will retry.
    } finally {
      commandPollInFlight = false;
    }
  }

  return { pollRemoteCommands };
}

module.exports = { createRemoteCommandPoller };
