import * as vscode from 'vscode';
import fs from 'fs';
import path  from 'path';
import { Breakpoint, BreakpointMetaData } from './utils';
import {window} from './utils';

type FileMetadata = {
    size: number;
    birthtime: Date;
    mtime: Date;
};

export default class StorageManager {

    private storagePath: string;
    private context: vscode.ExtensionContext;
    private loadedBreakpoints: Breakpoint[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.storagePath = context.storageUri?.fsPath || "";
        this.context = context;
        
        // Ensure the base directory exists
        if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true });
        }

        // Subdirectories to create
        const subdirs: string[] = ['session', 'breakpoints'];

        subdirs.forEach((dir: string) => {
            const fullPath: string = path.join(this.storagePath, dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
            }
        });
        this.loadBreakpoints();
    }

    // Helper function to get current timestamp
    getCurrentTimestamp = (): string => {
        const now: Date = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    }

    // Save the contents to a file
    saveToFile = (fullPath: string, content: string): void => {
        fs.writeFileSync(fullPath, content);
        window.showInformationMessage(`Saved to: ${fullPath}`);
    }

    // Read contents from a file
    readFromFile = (filename: string): string | null => {
        const filePath: string = path.join(this.storagePath, filename);
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8');
        } else {
            window.showErrorMessage(`File not found: ${filePath}`);
            return null;
        }
    }

    //save breakpoint
    saveBreakpoint = (bp: Breakpoint, fileName: string): void => {
        const content: string = Object.values(bp.content).join('\n');
        const fullPath: string = path.join(this.storagePath, 'breakpoints', fileName);
        this.saveToFile(fullPath, content);
        this.upsertBreakpointScripts(bp, fullPath);
    }

    _updateBreakpoints = (breakpoints: Breakpoint[]) => {
        this.context.workspaceState.update('breakpoints', breakpoints);
        this.loadBreakpoints(); //refresh
    }

    // Update record
    upsertBreakpointScripts = (bp: Breakpoint, fullPath: string): void => {
        const loadedBreakpoints: Breakpoint[] = this.loadBreakpoints();
        const existingBreakpoint: Breakpoint | undefined = loadedBreakpoints.find((b: Breakpoint) => b.id === bp.id);
        if (existingBreakpoint) {
            existingBreakpoint.scripts.push(fullPath);
            existingBreakpoint.modifiedAt = this.getCurrentTimestamp();
        } else {
            bp.scripts.push(fullPath);
            bp.createdAt = this.getCurrentTimestamp();
            loadedBreakpoints.push(bp);
        }
        this._updateBreakpoints(loadedBreakpoints);
    }

    // Load all breakpoints
    loadBreakpoints = (): Breakpoint[] => {
        this.loadedBreakpoints = this.context.workspaceState.get('breakpoints', []);
        return this.loadedBreakpoints;
    }

    // Save session output
    saveSessionOutput = (sessionOutput: string, sessionId: string): void => {
        const content: string = Object.values(sessionOutput).join('\n');
        const sessionFilename: string = `${sessionId}_${this.getCurrentTimestamp()}`;
        const fullPath: string = path.join(this.storagePath, 'session', sessionFilename);
        this.saveToFile(fullPath, content);
    }

    fileExists = (filename: string): boolean => {
        const paths: [string, string] = ['session', 'breakpoints'].map(
            (dir: string): string => {
                return path.join(this.storagePath, dir, filename);
            }
        ) as [string, string];
    
        const [sessionPath, breakpointsPath] = paths;
        
        return fs.existsSync(sessionPath) || fs.existsSync(breakpointsPath);
    }
    

    breakpointFilesMetaData(): BreakpointMetaData[] {
        const _formatDate = (date: Date): string => {
            return date.toLocaleString('en-US', {
                timeZoneName: 'short',
            });
        }

        const breakpointsPath: string = path.join(this.storagePath, 'breakpoints');
        return fs.readdirSync(breakpointsPath).map((file: string) => {
            const fullPath: string = path.join(breakpointsPath, file);
            const { size, birthtime: _createdAt, mtime: _modifiedAt }: FileMetadata = fs.statSync(fullPath);
            const [createdAt, modifiedAt]: [string, string] = [_createdAt, _modifiedAt].map(_formatDate) as [string, string];
            return { fileName: file, fullPath, size, createdAt, modifiedAt };
        });
    }
    
    openBreakpointFile(fileName: string) {
        const fullPath: string = path.join(this.storagePath, 'breakpoints', fileName);
        vscode.workspace.openTextDocument(fullPath).then((document: vscode.TextDocument) => {
            window.showTextDocument(document);
        });
    }

    deleteBreakpointFile(fileName: string) {
        const fullPath: string = path.join(this.storagePath, 'breakpoints', fileName);
        fs.unlinkSync(fullPath);

        const loadedBreakpoints: Breakpoint[] = this.loadBreakpoints();
        const updatedBreakpoints: Breakpoint[] = loadedBreakpoints.filter(bp => {
            const updatedScripts: string[] = bp.scripts.filter((s: string) => s !== fullPath);
            bp.scripts = updatedScripts;
            return bp.scripts.length > 0; // Remove if no scripts are left
        });
        this._updateBreakpoints(updatedBreakpoints);
    }

}

