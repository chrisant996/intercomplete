import * as vscode from 'vscode';

/**
 * HACK!  VSCode executes commands concurrently; it doesn't ensure sequential
 * execution.  It also doesn't have any concurrency synchronization mechanisms.
 * So I'll try to mitigate the reentrancy flaw with a busy counter and double
 * checked increment to gate reentrancy.
 */
let busy: number = 0;

/**
 * Inline mode tracks a pseudo-modal state by predicting expected selection
 * change and document change events.
 *
 * @constant true           => Use inline mode.
 * @constant false          => NYI: Use an input box.
 */
const inlineMode: boolean = true;

/**
 * The original feedback mode was a peek-like decoration on the last line in the
 * window.  But it shifts the line's actual text far to the right, which forces
 * a horizontal scrollbar to show up.  It also has some jitter issues.
 *
 * The status bar item feedback mode lags behind and can jump around in the
 * status bar if other status bar items respond to selection changes or content
 * changes.
 *
 * @constant Default        => Use the default feedback mode.
 * @constant Decoration     => Use the original peek-like decoration.
 * @constant StatusBarItem  => Use a status bar item.
 */
enum FeedbackMode { Default, Decoration, StatusBarItem };
let feedbackMode: FeedbackMode = FeedbackMode.Decoration;

/**
 * Set environment parameter to enable debugging mode e.g in launch.json.
 *
 * @example "env": { "INTERCOMPLETE_DEBUGMODE": "true" },
 */
const debugMode = process.env.INTERCOMPLETE_DEBUGMODE === 'true';

//#region Activate and Deactivate.

export function activate(context: vscode.ExtensionContext)
{
	vscode.commands.executeCommand('setContext', INTERCOMPLETE_CONTEXT, false);

	initFeedbackModeFromConfig();

	// Register commands.
	context.subscriptions.push(
		vscode.commands.registerCommand('intercomplete.prevInterComplete', prevInterComplete),
		vscode.commands.registerCommand('intercomplete.nextInterComplete', nextInterComplete),
		vscode.commands.registerCommand('intercomplete.moreInterComplete', moreInterComplete),
		vscode.commands.registerCommand('intercomplete.cancelInterComplete', cancelInterComplete)
	);

	// Register events.
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(onDidChangeConfiguration),
		vscode.window.onDidChangeActiveTextEditor(onDidChangeActiveEditor)
	);

	if (inlineMode) {
		context.subscriptions.push(
			vscode.window.onDidChangeTextEditorSelection(onDidChangeEditorSelection),
			vscode.workspace.onDidChangeTextDocument(onDidChangeTextDocument),
			vscode.window.onDidChangeTextEditorVisibleRanges(onDidChangeVisibleRanges)
		);
	}
}

export function deactivate() {}

//#endregion

//#region Configuration.

function getConfig<type = vscode.WorkspaceConfiguration>(key?: string, section: string = "intercomplete"): type
{
	const rawKey = undefined === key ? undefined : key.split(".").reverse()[0];
	const rawSection = undefined === key || rawKey === key ? section : `${section}.${key.replace(/(.*)\.[^\.]+/, "$1")}`;
	const configuration = vscode.workspace.getConfiguration(rawSection);
	return rawKey ?
		configuration[rawKey] :
		configuration;
}

//#endregion

//#region Extension context.

const INTERCOMPLETE_CONTEXT = 'intercompleteActive';	// Used in "when" clauses for commands and keybindings.
let intercompleteContext: boolean = false;				// There's no getContext API, so extensions can't check their own public context state.

async function setContext(context: boolean)
{
	if (!inlineMode) {
		return;
	}

	if (debugMode && intercompleteContext !== context) { console.log(`setContext: ${INTERCOMPLETE_CONTEXT} = ${context?'true':'false'}`); }
	intercompleteContext = context;
	await vscode.commands.executeCommand('setContext', INTERCOMPLETE_CONTEXT, context);
}

//#endregion

//#region Feedback.

let scrollTimeout: NodeJS.Timeout | null;
let decoratedEditor: vscode.TextEditor | undefined;
let decorationTypeCapturedAnchor: vscode.TextEditorDecorationType | undefined;
let decorationTypeReplaceRange: vscode.TextEditorDecorationType | undefined;
let decorationTypePeek: vscode.TextEditorDecorationType | undefined;
let decorationTypeEmptyPeek: vscode.TextEditorDecorationType | undefined;

let statusBarItem: vscode.StatusBarItem | null;

function makeCapturedAnchorDecoration(): vscode.TextEditorDecorationType
{
	const fore = new vscode.ThemeColor('editor.foreground');
	const back = new vscode.ThemeColor('editor.wordHighlightStrongBackground');
	return vscode.window.createTextEditorDecorationType({
		color: fore,
		backgroundColor: back,
		overviewRulerColor: back,
		overviewRulerLane: vscode.OverviewRulerLane.Full,
		borderColor: fore,
		borderStyle: 'none none dotted none',
		borderWidth: '1px'
	});
}

function makeReplaceRangeDecoration(): vscode.TextEditorDecorationType
{
	const fore = new vscode.ThemeColor('editor.foreground');
	const back = new vscode.ThemeColor('editor.wordHighlightBackground');
	return vscode.window.createTextEditorDecorationType({
		color: fore,
		backgroundColor: back,
		borderColor: fore,
		borderStyle: 'none none dotted none',
		borderWidth: '1px'
	});
}

function makePeekDecoration(): vscode.TextEditorDecorationType
{
	const fore = new vscode.ThemeColor('editor.foreground');
	const back = new vscode.ThemeColor('editor.wordHighlightStrongBackground');
	return vscode.window.createTextEditorDecorationType({
		after: {
			color: fore,
			backgroundColor: back,
		},
		textDecoration: 'white-space: pre;'
	});
}

function makeEmptyPeekDecoration(): vscode.TextEditorDecorationType
{
	// const fore = new vscode.ThemeColor('editor.foreground');
	// const back = new vscode.ThemeColor('editor.wordHighlightStrongBackground');
	return vscode.window.createTextEditorDecorationType({
		// after: {
		// 	color: fore,
		// 	backgroundColor: back,
		// },
		textDecoration: 'white-space: pre;'
	});
}

function initFeedbackModeFromConfig()
{
	switch (getConfig<string>('feedbackMode')) {
		default:
		case 'decoration':
			feedbackMode = FeedbackMode.Decoration;
			break;
		case 'status bar':
			feedbackMode = FeedbackMode.StatusBarItem;
			break;
	}
}

function clearPeekFeedback()
{
	if (scrollTimeout) {
		clearTimeout(scrollTimeout);
		scrollTimeout = null;
	}
	if (decoratedEditor) {
		if (decorationTypePeek) {
			decoratedEditor.setDecorations(decorationTypePeek, []);
		}
		if (decorationTypeEmptyPeek) {
			decoratedEditor.setDecorations(decorationTypeEmptyPeek, []);
		}
	}
}

function clearFeedback()
{
	switch (feedbackMode) {
		case FeedbackMode.Decoration:
			clearPeekFeedback();
			break;
		case FeedbackMode.StatusBarItem:
			if (statusBarItem) {
				statusBarItem.text = '';
				statusBarItem.hide();
			}
			break;
	}

	if (decoratedEditor) {
		if (decorationTypeCapturedAnchor) {
			decoratedEditor.setDecorations(decorationTypeCapturedAnchor, []);
		}
		if (decorationTypeReplaceRange) {
			decoratedEditor.setDecorations(decorationTypeReplaceRange, []);
		}
	}

	decoratedEditor = undefined;
}

function showFeedback(editor: vscode.TextEditor | undefined)
{
	if (debugMode && !replaceRange) { console.log("showFeedback: can't show feedback; replaceRange is undefined"); }

	if (editor !== decoratedEditor) {
		clearFeedback();
		decoratedEditor = editor;
	}

	if (!editor || !decoratedEditor) {
		if (debugMode) { console.log("showFeedback: editor is undefined"); }
		return;
	}

	if (!decorationTypeCapturedAnchor) {
		decorationTypeCapturedAnchor = makeCapturedAnchorDecoration();
	}
	if (!decorationTypeReplaceRange) {
		decorationTypeReplaceRange = makeReplaceRangeDecoration();
	}

	const showCapturedAnchor = capturedAnchor && replaceRange && (capturedAnchor.line !== replaceRange.start.line || capturedAnchor.character !== replaceRange.start.character);

	switch (feedbackMode) {

		case FeedbackMode.Decoration:
			{
				if (!decorationTypePeek) {
					decorationTypePeek = makePeekDecoration();
				}
				if (!decorationTypeEmptyPeek) {
					decorationTypeEmptyPeek = makeEmptyPeekDecoration();
				}

				if (showCapturedAnchor && capturedAnchor && replaceRange) {
					// First and last completely visible lines in editor.
					if (debugMode && editor.visibleRanges.length < 1) { console.warn('showFeedback: the editor has no visible lines'); }
					const firstVisibleLine = editor.visibleRanges[0].start.line;
					const lastVisibleLine = editor.visibleRanges[0].end.line;

					let showFeedback = true;
					// If capturedAnchor is already visible no need to show preview.
					// if (firstVisibleLine <= capturedAnchor.line && capturedAnchor.line <= lastVisibleLine) {
					// 	showFeedback = false;
					// }
					if (showFeedback) {
						// Preview text => line number + captured completion text.
						let peekLine = lastVisibleLine;
						if (peekLine === replaceRange.start.line) {
							peekLine--;
						}
						const emptyLine: number | undefined = (
							(peekLine === lastVisibleLine) ? peekLine + 1 :
							(peekLine === firstVisibleLine) ? peekLine - 1 :
							undefined);

						// let peekText = `From ${capturedAnchor.line}:  ## ${capturedText.substr(0, morePosition)} ## ${capturedText.substr(morePosition)}`;
						let peekText = `Complete more from line ${capturedAnchor.line} >>  ${capturedText.substr(morePosition)}`;

						// Replace whitespace indents with unicode white spaces => Otherwise they are not shown and the text is not indented to the correct position.
						const unicodeWhitespace = String.fromCodePoint(0x00a0);
						peekText = peekText.replace(/ /g, unicodeWhitespace);

						// Handle tabs by replacing with 2 whitespaces for now.
						peekText = peekText.replace(/\t/g, `${unicodeWhitespace}${unicodeWhitespace}`);

						// Add 200 Unicode Whitespaces afterwards to push the text in this line out of screen.
						peekText += Array(200).fill(unicodeWhitespace).join('');

						const peekLinePos = new vscode.Position(peekLine, 0);
						decoratedEditor.setDecorations(decorationTypePeek, [
							{ // Preview content line decoration
								range: new vscode.Range(peekLinePos, peekLinePos),
								renderOptions: {
									after: {
										contentText: peekText
									},
								}
							}
						]);

						if (emptyLine && emptyLine >= 0 && emptyLine < editor.document.lineCount) {
							// Sometimes there is a half visible line adjacent to the peek line
							// => add an empty text decoration here to push the original text of this line out of the screen.
							const emptyText = Array(peekText.length).fill(unicodeWhitespace).join('');
							const emptyLinePos = new vscode.Position(emptyLine, 0);
							decoratedEditor.setDecorations(decorationTypeEmptyPeek, [
								{ // Empty line decoration
									range: new vscode.Range(emptyLinePos, emptyLinePos),
									renderOptions: {
										after: {
											contentText: emptyText
										}
									}
								}
							]);
						} else {
							decoratedEditor.setDecorations(decorationTypeEmptyPeek, []);
						}
					} else {
						decoratedEditor.setDecorations(decorationTypePeek, []);
						decoratedEditor.setDecorations(decorationTypeEmptyPeek, []);
					}
				} else {
					decoratedEditor.setDecorations(decorationTypePeek, []);
					decoratedEditor.setDecorations(decorationTypeEmptyPeek, []);
				}
			}
			break;

		case FeedbackMode.StatusBarItem:
			if (!statusBarItem) {
				statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9999);
				statusBarItem.command = 'intercomplete.moreInterComplete';
			}
			if (capturedAnchor) {
				const unicodeWhitespace = String.fromCodePoint(0x00a0);
				let text = `$(edit) Complete more $(triangle-right) ${capturedAnchor.line}:${unicodeWhitespace}${unicodeWhitespace}${capturedText.substr(morePosition)}`;
				text = text/*.replace(/ /g, unicodeWhitespace)*/.replace(/\t/g, `${unicodeWhitespace}${unicodeWhitespace}`);

				statusBarItem.tooltip = `Click to complete more from line ${capturedAnchor.line}`;
				statusBarItem.text = text;
				statusBarItem.show();
			} else {
				statusBarItem.hide();
			}
			break;

	}

	if (showCapturedAnchor && capturedAnchor) {
		const anchorDecorations = [{
			range: new vscode.Range(capturedAnchor, new vscode.Position(capturedAnchor.line, capturedAnchor.character + morePosition))
		}];
		decoratedEditor.setDecorations(decorationTypeCapturedAnchor, anchorDecorations);
	} else {
		decoratedEditor.setDecorations(decorationTypeCapturedAnchor, []);
	}

	if (replaceRange) {
		const replaceDecorations = [{
			range: new vscode.Range(replaceRange.start, new vscode.Position(replaceRange.start.line, replaceRange.start.character + morePosition))
		}];
		decoratedEditor.setDecorations(decorationTypeReplaceRange, replaceDecorations);
	} else {
		decoratedEditor.setDecorations(decorationTypeReplaceRange, []);
	}
}

//#endregion

//#region Capture state management.

let capturedKeyword: string | undefined = undefined;
let capturedAnchor: vscode.Position | undefined = undefined;
let replaceRange: vscode.Range | undefined;
let capturedText: string = "";
let morePosition: number = 0;
let endOfPrev: boolean = false;
let endOfNext: boolean = false;

const lastWordRegExp = /(\W|^)(\w+)$/;
const firstWordRegExp = /^(\w+)(\W|$)/;
const moreRegExp = /^(\W*\w+)(\W|$)/;

async function clearCapture()
{
	if (intercompleteContext) {
		await setContext(false);

		intercompleteContext = false;

		capturedKeyword = undefined;
		capturedAnchor = undefined;
		replaceRange = undefined;
		capturedText = "";
		morePosition = 0;
		endOfPrev = false;
		endOfNext = false;

		expectedSelectionChanges = [];
		expectedDocumentChanges = [];

		clearFeedback();
	}
}

async function insertCapturedText(editor: vscode.TextEditor, cookie: number)
{
	if (!replaceRange) {
		if (debugMode) { console.warn("insertCapturedText: replaceRange undefined"); }
		return;
	}

	if (debugMode) { console.log(`insertCapturedText ${cookie}:`); }

	try {

		if (capturedAnchor && capturedAnchor.line === replaceRange.start.line && capturedAnchor.character > replaceRange.start.character) {
			const delta = (morePosition) - (replaceRange.end.character - replaceRange.start.character);
			capturedAnchor = new vscode.Position(capturedAnchor.line, capturedAnchor.character + delta);
		}

		const replaceWith = capturedText.substr(0, morePosition);
		if (editor.document.getText(replaceRange) !== replaceWith) {

			// The "expected changes" need to match what happens in the
			// editor.edit() section further below.
			expectedSelectionChanges.push(replaceRange.start.character + morePosition);
			expectedDocumentChanges.push({ start: replaceRange.start.character, end: replaceRange.end.character, text: "" });
			expectedDocumentChanges.push({ start: replaceRange.start.character, end: replaceRange.start.character, text: replaceWith });

			if (debugMode) {
				console.warn(`insertCapturedText ${cookie}: ${replaceRange.start.line},${replaceRange.start.character}..${replaceRange.end.line},${replaceRange.end.character} "${replaceWith}"`);
				console.log(`  morePosition ${morePosition}`);
				console.log('  insertCapturedText: expected changes...');
				console.log('    expected selection changes:');
				for (let sc of expectedSelectionChanges) {
					console.log(`      ${replaceRange.start.line},${sc}`);
				}
				console.log('    expected document changes:');
				for (let dc of expectedDocumentChanges) {
					console.log(`      ${replaceRange.start.line},${dc.start}..${replaceRange.start.line},${dc.end} "${dc.text}"`);
				}
			}

			// The selection needs to end up at the end of what's inserted, but
			// edit.replace selects everything that's inserted.  So instead the
			// sequence needs to be edit.delete then edit.insert.
			await editor.edit(e =>
			{
				e.delete(replaceRange!);
				e.insert(replaceRange!.start, replaceWith);
			});

			if (debugMode) {
				console.log(`insertCapturedText ${cookie}: set replaceRange = ${replaceRange.start.line},${replaceRange.start.character}..${replaceRange.start.line},${replaceRange.start.character + morePosition}`);
				console.log(`insertCapturedText ${cookie}: set editor.selection = ${replaceRange.end.line},${replaceRange.end.character}`);
			}

			replaceRange = new vscode.Range(replaceRange.start.line, replaceRange.start.character, replaceRange.start.line, replaceRange.start.character + morePosition);
			editor.selection = new vscode.Selection(replaceRange.end, replaceRange.end);
		}

		showFeedback(editor);

	} catch (error) {
	}
}

async function captureAnchor(line: number, character: number, cookie: number)
{
	capturedAnchor = new vscode.Position(line, character);
	endOfPrev = false;
	endOfNext = false;

	capturedText = "";
	morePosition = 0;

	if (debugMode) { console.log(`captureAnchor ${cookie}: new anchor {${line},${character}}`); }

	intercompleteContext = true;
	await setContext(true);
}

async function captureLine(editor: vscode.TextEditor, line: number, character: number, cookie:number)
{
	if (replaceRange === undefined || capturedKeyword === undefined) {
		if (debugMode) { console.log("captureLine: replaceRange or capturedKeyword not defined yet"); }
		return;
	}

	if (debugMode) { console.log(`captureLine ${cookie}: ${line},${character}`); }

	await captureAnchor(line, character, cookie);

	const docLine = editor.document.lineAt(line);
	capturedText = docLine.text.substr(character);

	morePosition = 0;
	if (line === replaceRange.start.line && character === replaceRange.start.character) {
		morePosition = capturedKeyword.length;
	} else {
		morePosition = getMoreFromString(capturedText).length;
	}

	if (debugMode) { console.log(`captureLine ${cookie}: line ${capturedAnchor?.line}, char ${capturedAnchor?.character}, morePosition ${morePosition}, "## ${capturedText.substr(0, morePosition)} ## ${capturedText.substr(morePosition)}"`); }

	await insertCapturedText(editor, cookie);
}

async function anchorNextPrev(editor: vscode.TextEditor, next: boolean, cookie: number)
{
	if (!capturedAnchor) {
		if (debugMode) { console.log("anchorNextPrev: no anchor"); }
		return;
	}

	let doc = editor.document;
	const regexp = new RegExp(`(^|\\W)(${capturedKeyword?.length ? capturedKeyword : "\\w"})`, "ig");
	if (next) {
		if (!endOfNext) {
			let yy = capturedAnchor.line;
			let xx = capturedAnchor.character + morePosition;

			// Advance past the current word.
			{
				const theRest = doc.lineAt(yy).text.substr(xx);
				const matches = firstWordRegExp.exec(theRest);
				if (matches) {
					xx += matches[0].length;
				}
			}

			// Advance to the next match.
			while (yy < doc.lineCount) {
				if (xx < doc.lineAt(yy).text.length) {
					let str = doc.lineAt(yy).text;
					if (xx > 0) {
						str = str.substr(xx);
					}
					const match = regexp.exec(str);
					if (match) {
						return captureLine(editor, yy, xx + match.index + match[1].length, cookie);
					}
				}
				xx = 0;
				yy++;
			}

			endOfNext = true;
		}
	} else {
		if (!endOfPrev) {
			let yy = capturedAnchor.line;
			let xx = capturedAnchor.character;

			// Retreat to the previous match.
			while (yy >= 0) {
				let str = doc.lineAt(yy).text;
				if (xx >= 0 && xx < str.length) {
					str = str.substr(0, xx);
				}
				let match;
				let lastMatch;
				while (match = regexp.exec(str)) {
					lastMatch = match;
				}
				if (lastMatch) {
					return captureLine(editor, yy, lastMatch.index + lastMatch[1].length, cookie);
				}
				xx = -1;
				yy--;
			}

			endOfPrev = true;
		}
	}

	if (debugMode) { console.log("anchorNextPrev: no more matches"); }
}

//#endregion

//#region Event handlers.

type ExpectedDocumentChange = {
	start: number;
	end: number;
	text: string;
};

let expectedSelectionChanges: number[] = [];
let expectedDocumentChanges: ExpectedDocumentChange[] = [];

function onDidChangeConfiguration(cfg: vscode.ConfigurationChangeEvent)
{
	let reset = false;
	if (cfg.affectsConfiguration('workbench.colorCustomizations')) {
		reset = true;
	}
	if (cfg.affectsConfiguration('intercomplete.feedbackMode')) {
		reset = true;
		if (statusBarItem) {
			statusBarItem.dispose();
			statusBarItem = null;
		}
		initFeedbackModeFromConfig();
	}

	if (reset) {
		cancelInterComplete();
		decorationTypePeek = undefined;
		decorationTypeEmptyPeek = undefined;
		decorationTypeCapturedAnchor = undefined;
		decorationTypeReplaceRange = undefined;
	}
}

async function onDidChangeActiveEditor(editor: vscode.TextEditor | undefined)
{
	await clearCapture();
}

function testExpectedSelectionChange(character: number): boolean
{
	while (true) {
		// No expected changes => bad.
		const expected = expectedSelectionChanges.shift();
		if (!expected) { break; }

		// Change matched an expected change => good, return!
		if (character === expected) {
			return true;
		}

		// Change didn't match the next expected change => keep looking.
		if (debugMode) { console.log(`testExpectedSelectionChange: ate expected selection change ${expected}`); }
	}

	return false;
}

async function onDidChangeEditorSelection(e: vscode.TextEditorSelectionChangeEvent)
{
	if (!capturedAnchor || !replaceRange) {
		return;
	}

	if (debugMode) {
		console.warn('onDidChangeEditorSelection: selection change:');
		if (e.selections.length > 0) {
			let ii = 0;
			for (let sel of e.selections) {
				console.log(`    [${ii++}]:  ${sel.start.line},${sel.start.character}..${sel.end.line},${sel.end.character}`);
			}
		} else {
			console.log('    no selections');
		}
		console.log(`expected selection changes on line ${replaceRange.start.line}:`);
		if (expectedSelectionChanges.length > 0) {
			for (let expected of expectedSelectionChanges) {
				console.log(`    ${expected}`);
			}
		} else {
			console.log('    none');
		}
	}

	do {
		// No expected changes => cancel.
		if (expectedSelectionChanges.length < 1) {
			if (debugMode) { console.log('    no selection changes expected => cancel'); }
			break;
		}

		// Multiple selections => cancel.
		if (e.selections.length !== 1) {
			if (debugMode) { console.log('    wrong number of selections => cancel'); }
			break;
		}

		// Other line selected => cancel.
		const sel = e.selections[0];
		if (sel.active.line !== replaceRange.start.line) {
			if (debugMode) { console.log('    some other line selected => cancel'); }
			break;
		}
		if (sel.anchor.line !== replaceRange.start.line) {
			if (debugMode) { console.log('    some other line selected => cancel'); }
			break;
		}

		// Selection isn't empty => cancel.
		if (sel.active.character !== sel.anchor.character) {
			if (debugMode) { console.log('    selection isn\'t empty => cancel'); }
			break;
		}

		// Change doesn't match an expected change => cancel.
		if (!testExpectedSelectionChange(sel.active.character)) {
			if (debugMode) { console.log(`    doesn't match any expected selection change => cancel`); }
			break;
		}

		// Change matched expected change => don't cancel.
		return true;
	} while (false);

	await clearCapture();
}

function testExpectedDocumentChange(chg: vscode.TextDocumentContentChangeEvent, expectedLine: number): boolean
{
	while (true) {
		// No expected changes => bad.
		const expected = expectedDocumentChanges.shift();
		if (!expected) { break; }

		// Change matches an expected change => good, return!
		if (chg.range.start.character === expected.start && chg.range.end.character === expected.end && chg.text === expected.text) {
			return true;
		}

		// Change didn't match the next expected change => keep looking.
		if (debugMode) { console.log(`    testExpectedDocumentChange: ate expected document change ${expectedLine},${expected.start}..${expectedLine},${expected.end}, "${expected.text}"`); }
	}

	return false;
}

async function onDidChangeTextDocument(e: vscode.TextDocumentChangeEvent)
{
	if (!capturedAnchor || !replaceRange) {
		return;
	}

	let ii = 0;
	if (debugMode) {
		console.warn('onDidChangeTextDocument: content changes:');
		for (let chg of e.contentChanges) {
			console.log(`    [${ii++}]:  ${chg.range.start.line},${chg.range.start.character}..${chg.range.end.line},${chg.range.end.character}, "${chg.text}"`);
		}
		console.log('processing content changes:');
		ii = 0;
	}

	let cancel = false;
	let chg: vscode.TextDocumentContentChangeEvent | null = null;
	for (chg of e.contentChanges) {
		cancel = true;

		if (debugMode) { console.log(`    [${ii++}]`); }

		// No expected changes => cancel.
		if (expectedDocumentChanges.length < 1) {
			if (debugMode) { console.log('    no document changes expected => cancel'); }
			break;
		}

		// No changed range => cancel (but supposedly impossible).
		if (chg.range === undefined) {
			if (debugMode) { console.log('    chg.range is undefined => cancel'); }
			break;
		}

		// Change to an unexpected line => cancel.
		if (chg.range.start.line !== replaceRange.start.line) {
			if (debugMode) { console.log(`    chg.range.start.line ${chg.range.start.line} !== replaceRange.start.line ${replaceRange.start.line} => cancel`); }
			break;
		}
		if (chg.range.end.line !== replaceRange.start.line) {
			if (debugMode) { console.log(`    chg.range.end.line ${chg.range.end.line} !== replaceRange.start.line ${replaceRange.start.line} => cancel`); }
			break;
		}

		// Change doesn't match an expected change => cancel.
		if (!testExpectedDocumentChange(chg, replaceRange.start.line)) {
			if (debugMode) { console.log(`    doesn't match any expected document change => cancel`); }
			break;
		}

		// If the loop ends because this was the last change => don't cancel.
		cancel = false;
	}

	if (cancel) {
		await clearCapture();
	}
}

async function onDidChangeVisibleRanges(e: vscode.TextEditorVisibleRangesChangeEvent)
{
	if (feedbackMode === FeedbackMode.Decoration) {
		// Clear captured anchor decoration while scrolling because the decoration also scrolls.
		clearPeekFeedback();
		scrollTimeout = setTimeout(showFeedback, 150, e.textEditor);
	}
}

//#endregion

//#region Command handlers.

let commandNumber = 0;

export async function prevInterComplete(): Promise<void>
{
	busy++;
	if (busy === 1) {

		let editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
		if (editor && editor.selections.length === 1) {
			await nextprevCapture(editor, false/*next*/, commandNumber);
		}

	}
	busy--;
}

export async function nextInterComplete(): Promise<void>
{
	busy++;
	if (busy === 1) {

		let editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
		if (editor && editor.selections.length === 1) {
			await nextprevCapture(editor, true/*next*/, commandNumber);
		}

	}
	busy--;
}

async function nextprevCapture(editor: vscode.TextEditor, next: boolean, cookie: number): Promise<void>
{
	if (!capturedAnchor) {
		if (debugMode) { console.log(`nextprevCapture ${cookie}: capturedAnchor is undefined -- start a new capture`); }

		// Close various popups.
		vscode.commands.executeCommand('hideSuggestWidget');
		vscode.commands.executeCommand('closeParameterHints');
		vscode.commands.executeCommand('closeReferenceSearch');

		// Make sure it's fully reset -- e.g. endOfNext/etc may not be reset yet.
		await clearCapture();

		let pos = editor.selection.active;
		let line = editor.document.lineAt(pos.line);

		const end = pos.character;
		const matches = lastWordRegExp.exec(line.text.substr(0, end));
		const start = matches ? end - matches[2].length : end;

		if (start > end) {
			if (debugMode) { console.log(`nextprevCapture ${cookie}: couldn't initialize a new capture.`); }
			return;
		}

		if (debugMode) { console.log(`nextprevCapture ${cookie}: set replaceRange = ${pos.line},${start}..${pos.line},${end}`); }
		replaceRange = new vscode.Range(pos.line, start, pos.line, end);

		capturedKeyword = line.text.substring(start, end);
		await captureAnchor(pos.line, start, cookie);
	}

	await anchorNextPrev(editor, next, cookie);

	//REMOVE: if (debugMode) { console.log(`nextprevCapture ${cookie}: finished`); }
}

export async function moreInterComplete(): Promise<void>
{
	busy++;
	if (busy === 1) {

		let editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
		if (editor && editor.selections.length === 1) {
			await moreCapture(editor, commandNumber);
		}

	}
	busy--;
}

async function moreCapture(editor: vscode.TextEditor, cookie: number)
{
	if (!capturedAnchor || morePosition === 0) {
		if (debugMode) { console.log(`moreCapture ${cookie}: nothing captured yet.`); }
		return;
	}

	const moreText = getMoreFromString(capturedText.substr(morePosition));
	if (moreText.length > 0) {
		if (debugMode) { console.log(`moreCapture ${cookie}: expand more "${moreText}"`); }
		morePosition += moreText.length;

		await insertCapturedText(editor, cookie);
	}
}

export async function cancelInterComplete(): Promise<void>
{
	busy++;
	if (busy === 1) {

		await clearCapture();

	}
	busy--;
}

//#endregion

//#region Helpers

function getMoreFromString(text: string): string
{
	const matches = moreRegExp.exec(text);
	return matches ? matches[1] : text;
}

//#endregion
