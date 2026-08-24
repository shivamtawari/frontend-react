import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Cpu, Loader2, ArrowLeft, AlertTriangle } from "lucide-react";
import DatasetManagementLayout from "../components/datasets/gallery/DatasetManagementLayout";
import { useDataset } from "../contexts/DatasetContext";
import {
    getInferenceModelCatalog,
    getInferenceRoutingPolicy,
    updateInferenceRoutingPolicy,
    deleteInferenceRoutingPolicy,
} from "../api/inference";
import { fetchLabels } from "../api/labels";
import ModelOrchestrationPanel from "../components/inference/ModelOrchestrationPanel";
import { usePermissions } from "../hooks/usePermissions";
import { Permission } from "../utils/permissions";

/**
 * Model Orchestration Page
 *
 * Dedicated dataset management page for configuring dataset-level task and label
 * routing policies. These policies serve as canonical defaults for interactive
 * annotation tools, cross-image suggestions, and batch inference runs.
 */
export default function ModelOrchestrationPage() {
    const { datasetId } = useParams();
    const { currentDataset, loading: datasetLoading } = useDataset();
    const navigate = useNavigate();
    const { can } = usePermissions(datasetId);

    const canEdit = Boolean(can(Permission.AI_BATCH_INFER));
    const canView = Boolean(can(Permission.AI_INTERACTIVE) || can(Permission.AI_BATCH_INFER));

    const [labelsById, setLabelsById] = useState({});
    const [catalog, setCatalog] = useState({ models: [], retrieval_strategies: [] });
    const [policy, setPolicy] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const datasetIdRef = useRef(datasetId);
    datasetIdRef.current = datasetId;
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!datasetId || !canView) {
            if (!datasetLoading) {
                setIsLoading(false);
            }
            return undefined;
        }
        let cancelled = false;
        setIsLoading(true);
        setError(null);
        setIsSaving(false);
        setIsDeleting(false);
        setPolicy(null);
        setLabelsById({});
        setCatalog({ models: [], retrieval_strategies: [] });

        (async () => {
            try {
                const [labelResponse, catalogResponse, policyResponse] = await Promise.all([
                    fetchLabels(datasetId),
                    getInferenceModelCatalog(datasetId),
                    getInferenceRoutingPolicy(datasetId),
                ]);
                if (cancelled || !isMountedRef.current || datasetIdRef.current !== datasetId) return;

                const loadedLabels = labelResponse?.labels?.id_to_label_object || {};
                const loadedCatalog = catalogResponse || { models: [], retrieval_strategies: [] };

                setLabelsById(loadedLabels);
                setCatalog(loadedCatalog);
                setPolicy(policyResponse);
            } catch (e) {
                if (!cancelled && isMountedRef.current && datasetIdRef.current === datasetId) {
                    setError(e.message || "Could not load the models or routing policy for this dataset.");
                }
            } finally {
                if (!cancelled && isMountedRef.current && datasetIdRef.current === datasetId) {
                    setIsLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [datasetId, canView, datasetLoading]);

    const handleSavePolicy = async (bindings) => {
        const targetDatasetId = datasetId;
        setError(null);
        setIsSaving(true);
        try {
            const updated = await updateInferenceRoutingPolicy({
                dataset_id: Number(targetDatasetId),
                bindings,
            });
            if (!isMountedRef.current || datasetIdRef.current !== targetDatasetId) return;
            setPolicy(updated);
            return updated;
        } catch (e) {
            if (isMountedRef.current && datasetIdRef.current === targetDatasetId) {
                setError(e.message || "Failed to save dataset routing policy.");
            }
            throw e;
        } finally {
            if (isMountedRef.current && datasetIdRef.current === targetDatasetId) {
                setIsSaving(false);
            }
        }
    };

    const handleDeletePolicy = async () => {
        const targetDatasetId = datasetId;
        setError(null);
        setIsDeleting(true);
        try {
            await deleteInferenceRoutingPolicy(targetDatasetId);
            if (!isMountedRef.current || datasetIdRef.current !== targetDatasetId) return;
            setPolicy(null);
        } catch (e) {
            if (isMountedRef.current && datasetIdRef.current === targetDatasetId) {
                setError(e.message || "Failed to clear dataset routing policy.");
            }
            throw e;
        } finally {
            if (isMountedRef.current && datasetIdRef.current === targetDatasetId) {
                setIsDeleting(false);
            }
        }
    };

    return (
        <DatasetManagementLayout>
            <div className="flex flex-col h-full bg-well min-h-0 overflow-hidden">
                {/* Header */}
                <header className="p-4 px-6 border-b border-ln bg-p1 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <Link
                            to={`/dataset/${datasetId}/datamanagement`}
                            className="p-1.5 rounded-xl border border-ln bg-p1 text-t2 hover:bg-hv hover:text-t1 transition"
                            title="Back to Dataset Management"
                            aria-label="Back to Dataset Management"
                        >
                            <ArrowLeft size={16} />
                        </Link>
                        <div>
                            <h1 className="text-base font-semibold text-t1 flex items-center gap-2">
                                <Cpu size={18} className="text-ac" />
                                <span>Model Orchestration</span>
                                {currentDataset?.name && (
                                    <span className="text-xs font-normal text-t3">
                                        — {currentDataset.name}
                                    </span>
                                )}
                            </h1>
                            <p className="text-xs text-t3">
                                Configure default models and per-label routing policies for interactive tools, cross-image suggestions, and batch runs.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => navigate(`/dataset/${datasetId}/datamanagement`)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium border border-ln rounded-xl bg-p1 text-t1 hover:bg-hv transition"
                        >
                            <ArrowLeft size={13} />
                            <span>Dataset Management</span>
                        </button>
                    </div>
                </header>

                {/* Main Content Area */}
                <main className="flex-1 overflow-y-auto p-6">
                    {error && (
                        <div className="mb-6 p-4 bg-errBg border border-errLn rounded-2xl text-sm text-err flex items-center gap-2 max-w-4xl">
                            <AlertTriangle size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    {datasetLoading || (isLoading && canView) ? (
                        <div className="flex items-center justify-center p-12 text-sm text-t3 gap-2">
                            <Loader2 className="w-5 h-5 animate-spin text-ac" />
                            <span>Loading dataset models, routing policy, and labels…</span>
                        </div>
                    ) : !canView ? (
                        <div className="max-w-4xl p-6 bg-p1 border border-ln rounded-3xl text-center space-y-3">
                            <h2 className="text-sm font-semibold text-t1">Access Restricted</h2>
                            <p className="text-xs text-t3">
                                You do not have permission to view or configure model orchestration for this dataset.
                            </p>
                            <button
                                type="button"
                                onClick={() => navigate(`/dataset/${datasetId}/datamanagement`)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-accent text-white rounded-xl hover:bg-accent/90 transition"
                            >
                                <ArrowLeft size={13} />
                                <span>Return to Dataset Management</span>
                            </button>
                        </div>
                    ) : (
                        <div className="max-w-4xl">
                            <section className="border border-ln rounded-3xl bg-p1 p-6 shadow-xs">
                                <ModelOrchestrationPanel
                                    datasetId={Number(datasetId)}
                                    policy={policy}
                                    labelsById={labelsById}
                                    catalog={catalog}
                                    onSavePolicy={handleSavePolicy}
                                    onDeletePolicy={handleDeletePolicy}
                                    isSaving={isSaving}
                                    isDeleting={isDeleting}
                                    canEdit={canEdit}
                                />
                            </section>
                        </div>
                    )}
                </main>
            </div>
        </DatasetManagementLayout>
    );
}
