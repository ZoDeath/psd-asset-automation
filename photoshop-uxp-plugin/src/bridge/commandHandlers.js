function createRemoteCommandExecutor(handlers) {
  async function selectRequestedDocument(command) {
    const targetDocument = command.args?.targetDocument || command.args?.documentName;
    if (targetDocument && handlers.selectDocument) await handlers.selectDocument({ name: targetDocument });
  }

  const executors = {
    async batch_place_rm(command) {
      await selectRequestedDocument(command);
      const result = await handlers.batchPlacePhotos({
        folderPath: command.args?.folderPath || command.args?.path || null,
        members: ["RM"],
      });
      return { ok: !result?.failed?.length, result: { command: command.command, ...result } };
    },

    async batch_place_members(command) {
      await selectRequestedDocument(command);
      const result = await handlers.batchPlacePhotos({
        folderPath: command.args?.folderPath || command.args?.path || null,
        members: command.args?.members,
      });
      return { ok: !result?.failed?.length, result: { command: command.command, ...result } };
    },

    async place_member_photo(command) {
      await selectRequestedDocument(command);
      const result = await handlers.placeMemberFromFolder(command.args?.member, {
        folderPath: command.args?.folderPath || command.args?.path || null,
      });
      return { ok: !result?.failed?.length, result: { command: command.command, ...result } };
    },

    async refresh_snapshot(command) {
      await handlers.sendSnapshot();
      return { ok: true, result: { command: command.command } };
    },

    async inspect_rm(command) {
      await selectRequestedDocument(command);
      if (command.args?.cleanup) {
        await handlers.cleanupRm();
        await handlers.sendSnapshot?.();
        return { ok: true, result: { command: command.command, cleaned: true } };
      }
      await handlers.inspectRm();
      return { ok: true, result: { command: command.command } };
    },

    async inspect_member(command) {
      const member = command.args?.member || "RM";
      await selectRequestedDocument(command);
      await handlers.inspectMember(member);
      return { ok: true, result: { command: command.command, member } };
    },

    async apply_rhv_names(command) {
      await handlers.applyRhvNames();
      return { ok: true, result: { command: command.command } };
    },

    async list_documents(command) {
      return { ok: true, result: { command: command.command, documents: handlers.listDocuments() } };
    },

    async select_document(command) {
      const document = await handlers.selectDocument(command.args || {});
      await handlers.sendSnapshot();
      return { ok: true, result: { command: command.command, document } };
    },

    async inspect_documents(command) {
      return { ok: true, result: { command: command.command, documents: handlers.inspectDocuments() } };
    },

    async close_document(command) {
      const document = await handlers.closeDocument(command.args || {});
      await handlers.sendSnapshot();
      return { ok: true, result: { command: command.command, document } };
    },

    async save_document(command) {
      const document = await handlers.saveDocument(command.args || {});
      await handlers.sendSnapshot();
      return { ok: true, result: { command: command.command, document } };
    },

    async set_layer_visibility(command) {
      const layer = await handlers.setLayerVisibility(command.args || {});
      await handlers.sendSnapshot();
      return { ok: true, result: { command: command.command, layer } };
    },

    async delete_layer(command) {
      const layer = await handlers.deleteLayer(command.args || {});
      await handlers.sendSnapshot();
      return { ok: true, result: { command: command.command, layer } };
    },

    async transform_layer(command) {
      const layer = await handlers.transformLayer(command.args || {});
      await handlers.sendSnapshot();
      return { ok: true, result: { command: command.command, layer } };
    },
  };

  return async function executeRemoteCommand(command) {
    const executor = executors[command.command];
    if (!executor) throw new Error(`Unknown Photoshop command: ${command.command}`);
    return executor(command);
  };
}

module.exports = { createRemoteCommandExecutor };
