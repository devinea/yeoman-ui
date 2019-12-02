import { YouiLog } from "../youi-log";
import { RpcCommon } from "@sap-devx/webview-rpc/out.ext/rpc-common";
const stripAnsi = require("strip-ansi");

export class ServerLog implements YouiLog {
    private rpc: RpcCommon;
    private isLogVisible: boolean = false;
    /**
     *
     */
    constructor(rpc : RpcCommon) {
        this.rpc = rpc;        
    }
    public log(str: string): void {
        this.rpc.invoke("log", [stripAnsi(str)]);
    }
    public writeln(str: string): void {
        this.rpc.invoke("log", [stripAnsi(str)]);
    }
    public create(str: string): void {
        this.rpc.invoke("log", [stripAnsi(str)]);
    }
    public force(str: string): void {
        this.rpc.invoke("log", [stripAnsi(str)]);
    }
    public conflict(str: string): void {
        this.rpc.invoke("log", [stripAnsi(str)]);
    }
    public identical(str: string): void {
        this.rpc.invoke("log", [stripAnsi(str)]);
    }
    public skip(str: string): void {
        this.rpc.invoke("log", [stripAnsi(str)]);
    }
    public showLog(): boolean {
        this.isLogVisible = !this.isLogVisible;
        return !this.isLogVisible;
    }
}