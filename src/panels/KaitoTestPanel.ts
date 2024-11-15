import { spawn } from "child_process";
import getPort from "get-port";
import * as vscode from "vscode";
import * as k8s from "vscode-kubernetes-tools-api";
import { ReadyAzureSessionProvider } from "../auth/types";
import { sendPostRequest } from "../commands/utils/axios";
import { longRunning } from "../commands/utils/host";
import { MessageHandler, MessageSink } from "../webview-contract/messaging";
import { InitialState, ToVsCodeMsgDef, ToWebViewMsgDef } from "../webview-contract/webviewDefinitions/kaitoTest";
import { TelemetryDefinition } from "../webview-contract/webviewTypes";
import { BasePanel, PanelDataProvider } from "./BasePanel";

export class KaitoTestPanel extends BasePanel<"kaitoTest"> {
    constructor(extensionUri: vscode.Uri) {
        super(extensionUri, "kaitoTest", {
            testUpdate: null,
        });
    }
}

export class KaitoTestPanelDataProvider implements PanelDataProvider<"kaitoTest"> {
    public constructor(
        readonly clusterName: string,
        readonly subscriptionId: string,
        readonly resourceGroupName: string,
        readonly armId: string,
        readonly kubectl: k8s.APIAvailable<k8s.KubectlV1>,
        readonly kubeConfigFilePath: string,
        readonly sessionProvider: ReadyAzureSessionProvider,
        readonly modelName: string,
    ) {
        this.clusterName = clusterName;
        this.subscriptionId = subscriptionId;
        this.resourceGroupName = resourceGroupName;
        this.armId = armId;
        this.kubectl = kubectl;
        this.kubeConfigFilePath = kubeConfigFilePath;
        this.sessionProvider = sessionProvider;
        this.modelName = modelName;
    }
    getTitle(): string {
        return `Test KAITO Model`;
    }

    getInitialState(): InitialState {
        return {
            clusterName: this.clusterName,
            modelName: this.modelName,
            output: "",
        };
    }
    getTelemetryDefinition(): TelemetryDefinition<"kaitoTest"> {
        return {
            queryRequest: true,
        };
    }
    getMessageHandler(webview: MessageSink<ToWebViewMsgDef>): MessageHandler<ToVsCodeMsgDef> {
        void webview;
        return {
            queryRequest: (params) => {
                this.handleQueryRequest(
                    params.prompt,
                    params.temperature,
                    params.topP,
                    params.topK,
                    params.repetitionPenalty,
                    params.maxLength,
                    webview,
                );
            },
        };
    }

    nullIsFalse(value: boolean | null): boolean {
        return value ?? false;
    }
    // Tracks if query is currently being sent. If so, prevents user from sending another query
    private isQueryInProgress: boolean = false;

    // Sends a request to the inference server to generate a response to the given prompt
    private async handleQueryRequest(
        prompt: string,
        temperature: number,
        topP: number,
        topK: number,
        repetitionPenalty: number,
        maxLength: number,
        webview: MessageSink<ToWebViewMsgDef>,
    ) {
        // prevents user from re-submitting while a query is in progress
        if (this.isQueryInProgress) {
            vscode.window.showErrorMessage("Query already in progress. Please wait for the current query to finish.");
            return;
        }
        await longRunning(`Sending query...`, async () => {
            this.isQueryInProgress = true;
            const localPort = await getPort();
            const portForwardProcess = spawn("kubectl", [
                "port-forward",
                `svc/workspace-${this.modelName}`,
                `${localPort}:80`,
                "--kubeconfig",
                this.kubeConfigFilePath,
            ]);

            // slight delay to allow for port forwarding to initialize
            await new Promise((resolve) => setTimeout(resolve, 2000));
            try {
                const result = await sendPostRequest(
                    localPort,
                    prompt,
                    temperature,
                    topP,
                    topK,
                    repetitionPenalty,
                    maxLength,
                );
                webview.postTestUpdate({
                    clusterName: this.clusterName,
                    modelName: this.modelName,
                    output: JSON.parse(result).Result,
                });
                portForwardProcess.kill();
                this.isQueryInProgress = false;
            } catch (error) {
                vscode.window.showErrorMessage(`Error sending request to workspace via portforward: ${error}`);
                this.isQueryInProgress = false;
            }
        });
    }
}
