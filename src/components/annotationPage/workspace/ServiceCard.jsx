import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Info, Loader2, Play, Star } from 'lucide-react';
import Tooltip from './primitives/Tooltip';
import { getPromptTypeInfo } from '../../../utils/promptTypes';
import {
  useModelFavorites,
  useSetFavoriteModel,
  useClearFavoriteModel,
} from '../../../stores/selectors/annotationSelectors';

const STATUS_TONE = {
  busy: { color: '#60a5fa', title: 'Model is busy' },
  ready: { color: '#22c55e', title: 'Model is ready' },
  error: { color: '#ef4444', title: 'Model not available' },
  unknown: { color: '#6d757d', title: 'Unknown status' },
};

const StatusDot = ({ status }) => {
  const tone = STATUS_TONE[status] || STATUS_TONE.unknown;
  return (
    <span
      title={tone.title}
      className="w-[6px] h-[6px] rounded-full flex-none"
      style={{ background: tone.color, boxShadow: `0 0 0 3px ${tone.color}29` }}
    />
  );
};

/** Chips for the prompt types the selected model advertises. */
const PromptTypeChips = ({ types }) => {
  const list = (types || []).filter(Boolean);
  if (list.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-[5px] mt-[7px]">
      {list.map((type) => {
        const { label, howTo } = getPromptTypeInfo(type);
        return (
          <span
            key={type}
            title={howTo}
            className="inline-flex items-center h-[20px] px-[7px] rounded-5 border border-ln2 text-meta font-semibold text-t2 cursor-help"
          >
            {label}
          </span>
        );
      })}
    </div>
  );
};

/**
 * One annotation service in the tool-options drawer.
 *
 * Carries everything the old sidebar card did: status dot, model select,
 * favourite star, supported prompt types, usage hint, the
 * explicit Run button (instance segmentation only) and the collapsible model
 * description + tags.
 */
const ServiceCard = ({ service }) => {
  const [open, setOpen] = useState(service.key === 'prompted');
  const [infoOpen, setInfoOpen] = useState(false);

  const favorites = useModelFavorites();
  const setFavorite = useSetFavoriteModel();
  const clearFavorite = useClearFavoriteModel();

  const hasModels = (service.models || []).length > 0;
  const selectedModelObj =
    (service.models || []).find((m) => m.id === service.selectedModel) || service.models?.[0];
  const isFavorite = favorites?.[service.task] === service.selectedModel;
  const canRun =
    service.canRun ?? (hasModels && !service.isLoading && !service.isRunning);

  return (
    <div className="rounded-9 border border-ln2 bg-well px-[10px] py-[9px]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center gap-[7px] text-left"
      >
        <StatusDot status={hasModels ? selectedModelObj?.model_status || 'unknown' : 'error'} />
        <span className="flex-1 text-row font-bold text-t1 truncate">{service.name}</span>
        {service.isRunning && <Loader2 size={13} className="text-ac animate-spin" />}
        {open ? (
          <ChevronUp size={13} strokeWidth={1.9} className="text-t3" />
        ) : (
          <ChevronDown size={13} strokeWidth={1.9} className="text-t3" />
        )}
      </button>

      {open && (
        <div className="mt-[8px]">
          {service.isLoading ? (
            <div className="h-[27px] rounded-6 bg-hv animate-pulse" />
          ) : hasModels ? (
            <div className="flex items-center gap-[5px]">
              <select
                value={service.selectedModel || ''}
                onChange={(e) => service.setSelectedModel(e.target.value)}
                aria-label={`${service.name} model`}
                className="flex-1 h-[27px] px-[8px] rounded-6 border border-ln2 bg-well2 text-row text-t1 outline-none focus:border-ac"
              >
                {service.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              {service.selectedModel && (
                <Tooltip
                  label={isFavorite ? 'Default model — preselected next time' : 'Set as your default'}
                  placement="bottomRight"
                >
                  <button
                    type="button"
                    aria-pressed={isFavorite}
                    aria-label={isFavorite ? 'Remove default model' : 'Set as default model'}
                    onClick={() =>
                      isFavorite
                        ? clearFavorite(service.task)
                        : setFavorite(service.task, service.selectedModel)
                    }
                    className="w-[24px] h-[24px] flex items-center justify-center rounded-5 hover:bg-hv transition-colors"
                  >
                    <Star
                      size={13}
                      className={isFavorite ? 'fill-warn text-warn' : 'text-t3'}
                    />
                  </button>
                </Tooltip>
              )}
            </div>
          ) : (
            <p className="px-[8px] py-[5px] rounded-6 bg-errBg text-ctl text-err">
              No models available.
            </p>
          )}

          {service.selectionNotice && (
            <p className="mt-[6px] text-sect leading-[1.5] text-t3">
              {service.selectionNotice}
            </p>
          )}

          {selectedModelObj?.supported_prompt_types?.length > 0 && (
            <PromptTypeChips types={selectedModelObj.supported_prompt_types} />
          )}

          {service.usageHint && (
            <div className="flex items-start gap-[6px] mt-[8px]">
              <Info size={13} className="text-ac mt-[1px] flex-none" />
              <p className="text-sect leading-[1.5] text-t3">{service.usageHint}</p>
            </div>
          )}

          <div className="flex items-center justify-between mt-[9px] gap-[8px]">
            {service.onRun ? (
              <button
                type="button"
                onClick={service.onRun}
                disabled={!canRun}
                className="inline-flex items-center gap-[6px] h-[26px] px-[10px] rounded-6 bg-accent text-onAccent text-row font-bold transition-[filter] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {service.isRunning ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Play size={13} />
                )}
                {service.isRunning ? 'Running…' : 'Run'}
              </button>
            ) : (
              /* Instant mode used to live here as a switch. It is now one of the
                 three prompt actions in the drawer's tab group above, where it
                 sits beside the two other things a placed prompt can do. */
              <span />
            )}

            {selectedModelObj && (
              <button
                type="button"
                onClick={() => setInfoOpen((value) => !value)}
                className="inline-flex items-center gap-[4px] h-[22px] px-[7px] rounded-5 text-meta font-semibold text-t3 hover:bg-hv hover:text-t2 transition-colors"
              >
                Info
                {infoOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            )}
          </div>

          {infoOpen && selectedModelObj && (
            <div className="mt-[8px] pt-[8px] border-t border-ln">
              <p className="text-sect leading-[1.55] text-t3">
                {selectedModelObj.description || 'No description available.'}
              </p>
              {Array.isArray(selectedModelObj.tags) && selectedModelObj.tags.length > 0 && (
                <div className="flex flex-wrap gap-[5px] mt-[7px]">
                  {selectedModelObj.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center h-[19px] px-[7px] rounded-5 bg-acS text-ac text-meta font-semibold"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ServiceCard;
