import React, { useState } from "react";
import { Users2 } from "lucide-react";
import DeleteDatasetButton from "./DeleteDatasetButton";
import PlaceholderImage from "../ui/PlaceholderImage";
import DatasetAnnotationProgress from "./DatasetAnnotationProgress";
import ManageAccessModal from "./ManageAccessModal";
import RoleBadge from "./RoleBadge";
import Can from "../auth/Can";
import { Permission } from "../../utils/permissions";

const DatasetCard = ({
  dataset,
  stats,
  sampleImages,
  onDelete,
  onOpenDataset,
  onShareSuccess,
}) => {
  const [showAccessModal, setShowAccessModal] = useState(false);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Dataset Header */}
      <div className="bg-gradient-to-r from-teal-500 to-cyan-500 p-6 text-white relative">
        <Can permission={Permission.DATASET_DELETE} dataset={dataset}>
          <DeleteDatasetButton dataset={dataset} onClick={onDelete} />
        </Can>
        <h3 className="text-xl font-bold mb-2 pr-8">{dataset.name}</h3>
        <p className="text-teal-100 text-sm">
          {dataset.description || "No description provided"}
        </p>
        {dataset.my_role && (
          <div className="mt-3">
            <RoleBadge role={dataset.my_role} showDescription />
          </div>
        )}
      </div>

      {/* Sample Images */}
      <div className="p-4">
        <div className="grid grid-cols-4 gap-2 mb-4">
          {Array.from({ length: 4 }).map((_, index) => {
            const image = sampleImages[index];
            if (image && image.base64) {
              return (
                <div
                  key={index}
                  className="aspect-square rounded-lg overflow-hidden"
                >
                  <img
                    src={`data:image/jpeg;base64,${image.base64}`}
                    alt={`Sample ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              );
            } else {
              return (
                <PlaceholderImage
                  key={index}
                  src={null}
                  alt={`Sample ${index + 1}`}
                  className="aspect-square rounded-lg overflow-hidden"
                  fallbackText="No image"
                />
              );
            }
          })}
        </div>

        {/* Annotation Status */}
        <DatasetAnnotationProgress stats={stats} />

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Can
            anyOf={[Permission.MEMBER_LIST, Permission.MEMBER_GRANT, Permission.INVITE_CREATE]}
            dataset={dataset}
          >
            <button
              onClick={() => setShowAccessModal(true)}
              className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-lg text-sm hover:bg-gray-700 transition-colors flex items-center justify-center space-x-1"
            >
              <Users2 className="w-4 h-4 flex-shrink-0" />
              <span>Access</span>
            </button>
          </Can>
          <button
            onClick={() => onOpenDataset(dataset)}
            className="flex-1 bg-teal-600 text-white py-2 px-4 rounded-lg text-sm hover:bg-teal-700 transition-colors"
          >
            Open
          </button>
        </div>
      </div>

      <ManageAccessModal
        isOpen={showAccessModal}
        dataset={dataset}
        onClose={() => setShowAccessModal(false)}
        onChange={onShareSuccess}
      />
    </div>
  );
};

export default DatasetCard;
