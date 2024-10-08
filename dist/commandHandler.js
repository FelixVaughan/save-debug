"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = __importDefault(require("events"));
const path_1 = __importDefault(require("path"));
const utils_1 = require("./utils");
class CommandHandler extends events_1.default {
    constructor(sessionManager, storageManager) {
        super();
        this.startCapture = () => {
            const activeSession = utils_1._debugger.activeDebugSession; //!: Non-null assertion operator  
            let err_msg = "";
            if (!activeSession)
                err_msg = 'No active debug session.';
            else if (!this.pausedOnBreakpoint)
                err_msg = 'Not paused on a breakpoint.';
            else if (this.sessionManager.isCapturing())
                err_msg = 'Already capturing debug console input.';
            if (err_msg) {
                utils_1.window.showWarningMessage(err_msg);
                return;
            }
            this.sessionManager.setCapturing(true);
            this.emit('captureStarted'); // Emit event when capturing starts
            utils_1.window.showInformationMessage('Started capturing debug console input.');
        };
        this.pauseCapture = () => {
            if (this.sessionManager.capturePaused()) {
                utils_1.window.showWarningMessage('Capture already paused.');
                return;
            }
            if (!this.sessionManager.isCapturing()) {
                utils_1.window.showWarningMessage('Not capturing console input.');
                return;
            }
            this.sessionManager.setCapturePaused(true);
            utils_1.window.showInformationMessage('Paused capturing debug console input.');
        };
        this._isValidFilename = (name) => {
            const invalidChars = /[<>:"\/\\|?*\x00-\x1F]/g;
            const reservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
            if (invalidChars.test(name) || reservedNames.test(name) || name.length > 255)
                return false;
            return true;
        };
        this.stopCapture = (...args_1) => __awaiter(this, [...args_1], void 0, function* (autoSave = false) {
            if (!this.sessionManager.capturePaused() && !this.sessionManager.isCapturing()) {
                utils_1.window.showWarningMessage('Not capturing console input.');
                return;
            }
            const captureTerminationSignal = () => {
                this.sessionManager.setCapturing(false);
                this.emit('captureStopped'); // Emit event when capturing stops
            };
            const currentBreakpoint = this.sessionManager.getCurrentBreakpoint();
            if (!Object.keys(currentBreakpoint.content).length) {
                utils_1.window.showWarningMessage('Stopped: No console input captured.');
                captureTerminationSignal();
                return;
            }
            const defaultFileName = `${path_1.default.basename(currentBreakpoint.file)}_` +
                `${currentBreakpoint.line}_` +
                `${currentBreakpoint.column}_` +
                `${this.storageManager.getCurrentTimestamp()}`;
            let fileName;
            let invalidReason = "";
            while (true) {
                if (autoSave) {
                    fileName = defaultFileName;
                    break;
                }
                // Show input box to get the file name from the user
                fileName = yield utils_1.window.showInputBox({
                    prompt: invalidReason || 'Save console input:',
                    value: defaultFileName,
                    placeHolder: defaultFileName
                });
                // If the user presses Escape or enters nothing, exit the loop and return
                if (!fileName) {
                    utils_1.window.showWarningMessage('Capture in progress, termination aborted.');
                    return;
                }
                fileName = fileName.trim();
                // Check if the file already exists
                if (this.storageManager.fileExists(fileName)) {
                    invalidReason = `File already exists: ${fileName}`;
                    continue;
                }
                // Check if the filename is valid
                if (!this._isValidFilename(fileName)) {
                    invalidReason = 'Invalid file name.';
                    continue;
                }
                // If the filename is valid and does not exist, break out of the loop
                break;
            }
            // Stop capturing and save the breakpoint with the specified file name 
            captureTerminationSignal();
            this.storageManager.saveBreakpoint(currentBreakpoint, fileName);
            this.sessionManager.resetCurrentBeakpointContent();
            utils_1.window.showInformationMessage(`Stopped capture: ${fileName}`);
        });
        this._selectScript = () => __awaiter(this, void 0, void 0, function* () {
            const scriptsMetaData = this.storageManager.breakpointFilesMetaData(); // This should return an array of script paths
            if (!scriptsMetaData.length) {
                utils_1.window.showInformationMessage('No saved breakpoints found.');
                return;
            }
            const selectedScript = yield utils_1.window.showQuickPick(scriptsMetaData.map((meta) => ({
                label: meta.fileName,
                description: `Created: ${meta.createdAt} | Modified: ${meta.modifiedAt} | Size: ${meta.size} bytes`
            })), {
                placeHolder: 'Select a saved breakpoint script to edit',
                canPickMany: false
            });
            // If no script was selected (user canceled the QuickPick)
            if (!selectedScript) {
                utils_1.window.showInformationMessage('No script selected.');
                return;
            }
            return selectedScript.label;
        });
        this.editSavedScript = () => __awaiter(this, void 0, void 0, function* () {
            const selectedScript = yield this._selectScript();
            if (selectedScript) {
                this.storageManager.openBreakpointFile(selectedScript);
            }
        });
        this.deleteSavedScript = () => __awaiter(this, void 0, void 0, function* () {
            const selectedScript = yield this._selectScript();
            if (selectedScript) {
                this.storageManager.deleteBreakpointFile(selectedScript);
                utils_1.window.showInformationMessage(`Deleted: ${selectedScript}`);
            }
        });
        this.activateScripts = () => {
            const breakpoints = this.storageManager.loadBreakpoints();
            if (breakpoints.length > 0) {
                utils_1.window.showInformationMessage(`Loaded ${breakpoints.length} breakpoints.`);
                breakpoints.forEach((breakpoint) => {
                    utils_1.window.showInformationMessage(`Activating breakpoint in file: ${breakpoint.file} at line: ${breakpoint.line}`);
                });
            }
            else {
                utils_1.window.showInformationMessage('No breakpoints to activate.');
            }
        };
        this.setPausedOnBreakpoint = (paused) => {
            this.pausedOnBreakpoint = paused;
        };
        this.sessionManager = sessionManager;
        this.storageManager = storageManager;
        this.pausedOnBreakpoint = false;
    }
}
exports.default = CommandHandler;
//# sourceMappingURL=commandHandler.js.map