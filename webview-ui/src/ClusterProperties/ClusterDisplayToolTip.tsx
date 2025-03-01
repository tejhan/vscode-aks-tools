import { ClusterInfo } from "../../../src/webview-contract/webviewDefinitions/clusterProperties";
import styles from "./ClusterProperties.module.css";

export interface ClusterDisplayToolTipProps {
    clusterInfo: ClusterInfo;
}

export function ClusterDisplayToolTip(props: ClusterDisplayToolTipProps) {
    return (
        <span className={styles.tooltip}>
            <span className={styles.infoIndicator}>
                <div className="icon">
                    <i className="codicon codicon-info" aria-label="info icon using vscode icons"></i>
                </div>
            </span>
            <span className={styles.tooltiptext}>
                <table>
                    <caption className={styles.tableHeader}>Current Versions Available</caption>
                    <tr>
                        <th>Version</th>
                        <th>Patch Versions</th>
                        <th>Support Plan</th>
                        <th>Preview</th>
                    </tr>
                    {props.clusterInfo.supportedVersions.map((v) => (
                        <tr key={v.version} className={styles.separator}>
                            <td>{v.version}</td>
                            <td>
                                {v.patchVersions.map((patchVersion, index) => (
                                    <div key={`patch-${index}`}>{patchVersion}</div>
                                ))}
                            </td>
                            <td>
                                {v.supportPlan.map((supportPlan, index) => (
                                    <div key={`capability-${index}`}>{supportPlan}</div>
                                ))}
                            </td>
                            <td>{v.isPreview ? "Yes" : "No"}</td>
                        </tr>
                    ))}
                    <tfoot>
                        <tr>
                            <td colSpan={3} className={styles.textLeftAlign}>
                                <a href="https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions?tabs=azure-cli#aks-kubernetes-release-calendar">
                                    Learn more
                                </a>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </span>
        </span>
    );
}
