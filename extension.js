// @FIXME: On tiled view the disposal is called when switching active tile
// @FIXME: When navigating between tiles and new cursor position is different sometimes it creates a selection on clicking back

const vscode = require('vscode');
const COMMAND_FOLD = 'editor.fold';
const COMMAND_UNFOLD_ALL = 'editor.unfoldAll';
// @FIXME: Don't match with empty block.
const RE_SIG_BLOCK = "^ *sig do$.*?^ *end$";
const RE_SIG_LINE = "^ *sig {.*?} *?$";

let byesigTimeout;
const DELAY_TIMEOUT_MS = 200;

let byesigDecorationType;
let temporaryDisable = false;

function delayedHideSig() {
	console.log('delayedHideSig');
	if (byesigTimeout) {
		clearTimeout(byesigTimeout);
	}

	byesigTimeout = setTimeout(hideSig, DELAY_TIMEOUT_MS);
}

async function hideAndFoldSig() {
	console.log('hideAndFoldSig');
	hideSig();
	await foldSig();
}

function decorationRenderOption() {
	return {
		opacity: vscode.workspace.getConfiguration('byesig').get('opacity').toString(),
		backgroundColor: vscode.workspace.getConfiguration('byesig').get('backgroundColor')
	}
}

function hideSig() {
	if (temporaryDisable) return;
	let editor = vscode.window.activeTextEditor;
	if (!editor) return;
	if (!isRubyFile(editor)) return;

	disposeHidingDecoration();
	byesigDecorationType = vscode.window.createTextEditorDecorationType(decorationRenderOption());

	if (!vscode.workspace.getConfiguration('byesig').get('enabled')) return;

	editor.setDecorations(byesigDecorationType, [
		...getMatchPositions(new RegExp(RE_SIG_BLOCK, "gsm"), editor),
		...getMatchPositions(new RegExp(RE_SIG_LINE, "gsm"), editor)
	]);
}

async function foldSig() {
	if (temporaryDisable) return;
	let editor = vscode.window.activeTextEditor;
	if (!editor) return;
	if (!vscode.workspace.getConfiguration('byesig').get('enabled')) return;
	if (!isRubyFile(editor)) return;

	let original_selection = editor.selection;
	let folded_selections = getMatchPositions(new RegExp(RE_SIG_BLOCK, "gsm"), editor).map((range) => {
		let line_pos = editor.selection.active.with(range.start.line, 0);
		return new vscode.Selection(line_pos, line_pos);
	});

	if (folded_selections.length > 0) {
		editor.selections = folded_selections;
		await vscode.commands.executeCommand(COMMAND_UNFOLD_ALL);
		await vscode.commands.executeCommand(COMMAND_FOLD);
		editor.selections = [original_selection];
	}
}

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

function isRubyFile(editor) {
	return editor.document.languageId == "ruby";
}

async function showAndUnfoldSig() {
	let editor = vscode.window.activeTextEditor;
	if (!editor) return;
	if (!isRubyFile(editor)) return;

	disposeHidingDecoration();
	byesigDecorationType = vscode.window.createTextEditorDecorationType(decorationRenderOption());

	if (!vscode.workspace.getConfiguration('byesig').get('enabled')) return;

	await vscode.commands.executeCommand(COMMAND_UNFOLD_ALL);
}

function disposeHidingDecoration() {
	if (byesigDecorationType) {
		byesigDecorationType.dispose();
	}
}

function onCommandHideAndFoldSig() {
	temporaryDisable = false;
	hideAndFoldSig();
}

function onCommandShowAndUnfoldSig() {
	temporaryDisable = true;
	showAndUnfoldSig();
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	context.subscriptions.push(vscode.commands.registerCommand('byesig.hideSig', onCommandHideAndFoldSig));
	context.subscriptions.push(vscode.commands.registerCommand('byesig.showSig', onCommandShowAndUnfoldSig));
	vscode.window.onDidChangeActiveTextEditor(hideAndFoldSig, null, context.subscriptions);
	vscode.workspace.onDidChangeTextDocument(delayedHideSig, null, context.subscriptions);

	if (vscode.window.activeTextEditor) hideAndFoldSig();
}
exports.activate = activate;
function deactivate() {}
module.exports = { activate, deactivate }
