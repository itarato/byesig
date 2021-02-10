const vscode = require('vscode');
const path = require('path');

const byesig = (function () {
  const COMMAND_FOLD = 'editor.fold';
  const COMMAND_UNFOLD_ALL = 'editor.unfoldAll';
  // @FIXME: Don't match with empty block. Empty block is not foldable by default and as such, folding
  // will affect the parent block - which we do not want.
  const RE_SIG_BLOCK = "^ *sig do$.*?^ *end\s*$";
  const RE_SIG_LINE = "^ *sig {.*?}.*?$";

  const FORCE = true;

  let hideDelayTimeout;
  const DELAY_TIMEOUT_MS = 200;

  let byesigDecorationType = {};
  let temporaryDisable = false;

  let knownDocuments = {};

  function delayedHideSig() {
    if (hideDelayTimeout) clearTimeout(hideDelayTimeout);
    hideDelayTimeout = setTimeout(hideSig, DELAY_TIMEOUT_MS);
  }

  async function hideAndFoldSig(force = false) {
    hideSig();
    await foldSig(force);
  }

  function decorationRenderOption() {
    let decoration = {
      opacity: vscode.workspace.getConfiguration('byesig').get('opacity').toString(),
      backgroundColor: vscode.workspace.getConfiguration('byesig').get('backgroundColor'),
    };

    if (vscode.workspace.getConfiguration('byesig').get('showIcon')) {
      decoration['gutterIconPath'] = path.join(__dirname, '..', 'misc', 'icon.png');
      decoration['gutterIconSize'] = "contain";
    }

    return decoration;
  }

  function hideSig() {
    if (temporaryDisable) return;
    let editor = vscode.window.activeTextEditor;
    if (!editor) return;
    if (!isRubyFile(editor)) return;

    let tile_key = genTileKey(editor);
    disposeHidingDecoration(tile_key);
    byesigDecorationType[tile_key] = vscode.window.createTextEditorDecorationType(decorationRenderOption());

    if (!vscode.workspace.getConfiguration('byesig').get('enabled')) return;

    editor.setDecorations(byesigDecorationType[tile_key], [
      ...getMatchPositions(new RegExp(RE_SIG_BLOCK, "gsm"), editor),
      ...getMatchPositions(new RegExp(RE_SIG_LINE, "gsm"), editor)
    ]);
  }

  async function foldSig(force = false) {
    if (!vscode.workspace.getConfiguration('byesig').get('fold')) return;
    if (!vscode.workspace.getConfiguration('byesig').get('enabled')) return;

    if (temporaryDisable) return;

    let editor = vscode.window.activeTextEditor;
    if (!editor) return;

    if (!isRubyFile(editor)) return;
    if (!force && !isNewlyOpened(editor.document.fileName)) return;

    // When switching active editor, it takes time for VSCode to establish a selection.
    // This wait is so the old location of the cursor can be captured correctly.
    setTimeout(async () => {
      let original_selection = editor.selection;
      let folded_selections = getMatchPositions(new RegExp(RE_SIG_BLOCK, "gsm"), editor).map((range) => {
        let line_pos = editor.selection.active.with(range.start.line, 0);
        return new vscode.Selection(line_pos, line_pos);
      });

      if (folded_selections.length > 0) {
        // This is a hack around not having an official API to find foldable regions (other than fold levels or all).
        editor.selections = folded_selections;
        await vscode.commands.executeCommand(COMMAND_UNFOLD_ALL);
        await vscode.commands.executeCommand(COMMAND_FOLD);

        // After selecting the fold regions (and fold) if we restore the cursor immediately sometimes VSCode makes a
        // selection with the delta. To avoid this, we wait a little.
        setTimeout(() => {
          editor.selections = [original_selection];
          editor.revealRange(editor.selections[0]);
        }, 100);
      }
    }, 100);
  }

  /**
   * @param {RegExp} re
   * @param {import("vscode").TextEditor} editor
   */
  function getMatchPositions(re, editor) {
    let match;
    let text = editor.document.getText();
    let ranges = [];

    while ((match = re.exec(text))) {
      let start_pos = editor.document.positionAt(match.index);
      let end_pos = editor.document.positionAt(match.index + match[0].length);
      ranges.push(new vscode.Range(start_pos, end_pos));
    }

    return ranges;
  }

  /**
   * @param {import("vscode").TextEditor} editor
   */
  function isRubyFile(editor) {
    return editor.document.languageId == "ruby";
  }

  async function showAndUnfoldSig() {
    disposeAllHidingDecoration();
    if (!vscode.workspace.getConfiguration('byesig').get('enabled')) return;
    await vscode.commands.executeCommand(COMMAND_UNFOLD_ALL);
  }

  function disposeAllHidingDecoration() {
    for (let key in byesigDecorationType) {
      disposeHidingDecoration(key);
    }
  }

  /**
   * @param {string} key
   */
  function disposeHidingDecoration(key) {
    if (!byesigDecorationType[key]) return;

    byesigDecorationType[key].dispose();
    delete byesigDecorationType[key];
  }

  function onCommandHideAndFoldSig() {
    temporaryDisable = false;
    hideAndFoldSig(FORCE);
  }

  function onCommandShowAndUnfoldSig() {
    temporaryDisable = true;
    showAndUnfoldSig();
  }

  /**
   * @param {import("vscode").TextDocument} textDoc
   */
  function onDidOpenTextDocument(textDoc) {
    if (textDoc.languageId != 'ruby') return
    if (knownDocuments[textDoc.fileName]) {
      knownDocuments[textDoc.fileName] += 1;
    } else {
      knownDocuments[textDoc.fileName] = 1;
    }
  }

  /**
   * @param {import("vscode").TextDocument} textDoc
   */
  function onDidCloseTextDocument(textDoc) {
    if (textDoc.languageId != 'ruby') return
    if (!knownDocuments[textDoc.fileName]) return;

    delete knownDocuments[textDoc.fileName];
  }

  /**
   * @param {string} fileName
   */
  function isNewlyOpened(fileName) {
    return knownDocuments[fileName] == 1;
  }

  /**
   * @param {import("vscode").TextEditor} editor
   */
  function genTileKey(editor) {
    return editor.document.fileName;
  }

  /**
   * @param {{ subscriptions: import("vscode").Disposable[]; }} context
   */
  function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('byesig.hideSig', onCommandHideAndFoldSig));
    context.subscriptions.push(vscode.commands.registerCommand('byesig.showSig', onCommandShowAndUnfoldSig));
    vscode.window.onDidChangeActiveTextEditor(() => { hideAndFoldSig(); }, null, context.subscriptions);
    vscode.workspace.onDidChangeTextDocument(delayedHideSig, null, context.subscriptions);
    vscode.workspace.onDidOpenTextDocument(onDidOpenTextDocument, null, context.subscriptions);
    vscode.workspace.onDidCloseTextDocument(onDidCloseTextDocument, null, context.subscriptions);

    if (vscode.window.activeTextEditor) hideAndFoldSig();
  }

  return { activate: activate };
})();

module.exports = byesig;
