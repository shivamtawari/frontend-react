import React from 'react';

/**
 * Per-colour class sets for a card. Every card is white; its identity comes from
 * the icon colour, which the border, hover border, title-hover and stat all pick
 * up so the tile reads as one hue without a heavy filled background.
 *
 * The class strings are spelled out in full (never built by interpolation) so
 * Tailwind's scanner keeps them in the build.
 */
const PALETTE = {
  blue:   { iconBg: 'bg-blue-100',   iconHover: 'group-hover:bg-blue-200',   icon: 'text-blue-600',   border: 'border-blue-200',   hoverBorder: 'hover:border-blue-400',   title: 'group-hover:text-blue-700',   stat: 'text-blue-700' },
  purple: { iconBg: 'bg-purple-100', iconHover: 'group-hover:bg-purple-200', icon: 'text-purple-600', border: 'border-purple-200', hoverBorder: 'hover:border-purple-400', title: 'group-hover:text-purple-700', stat: 'text-purple-700' },
  indigo: { iconBg: 'bg-indigo-100', iconHover: 'group-hover:bg-indigo-200', icon: 'text-indigo-600', border: 'border-indigo-200', hoverBorder: 'hover:border-indigo-400', title: 'group-hover:text-indigo-700', stat: 'text-indigo-700' },
  green:  { iconBg: 'bg-green-100',  iconHover: 'group-hover:bg-green-200',  icon: 'text-green-600',  border: 'border-green-200',  hoverBorder: 'hover:border-green-400',  title: 'group-hover:text-green-700',  stat: 'text-green-700' },
  teal:   { iconBg: 'bg-teal-100',   iconHover: 'group-hover:bg-teal-200',   icon: 'text-teal-600',   border: 'border-teal-200',   hoverBorder: 'hover:border-teal-400',   title: 'group-hover:text-teal-700',   stat: 'text-teal-700' },
  orange: { iconBg: 'bg-orange-100', iconHover: 'group-hover:bg-orange-200', icon: 'text-orange-600', border: 'border-orange-200', hoverBorder: 'hover:border-orange-400', title: 'group-hover:text-orange-700', stat: 'text-orange-700' },
  rose:   { iconBg: 'bg-rose-100',   iconHover: 'group-hover:bg-rose-200',   icon: 'text-rose-600',   border: 'border-rose-200',   hoverBorder: 'hover:border-rose-400',   title: 'group-hover:text-rose-700',   stat: 'text-rose-700' },
  pink:   { iconBg: 'bg-pink-100',   iconHover: 'group-hover:bg-pink-200',   icon: 'text-pink-600',   border: 'border-pink-200',   hoverBorder: 'hover:border-pink-400',   title: 'group-hover:text-pink-700',   stat: 'text-pink-700' },
  amber:  { iconBg: 'bg-amber-100',  iconHover: 'group-hover:bg-amber-200',  icon: 'text-amber-600',  border: 'border-amber-200',  hoverBorder: 'hover:border-amber-400',  title: 'group-hover:text-amber-700',  stat: 'text-amber-700' },
  slate:  { iconBg: 'bg-slate-100',  iconHover: 'group-hover:bg-slate-200',  icon: 'text-slate-600',  border: 'border-slate-200',  hoverBorder: 'hover:border-slate-400',  title: 'group-hover:text-slate-700',  stat: 'text-slate-700' },
};

const ManagementCard = ({
  icon: Icon,
  title,
  description,
  stat = null,
  onClick,
  color = 'blue',
  // A placeholder card: it renders but does nothing yet. It drops the hover lift
  // and click affordance, dims itself, and shows a "Coming soon" tag so it reads
  // as not-yet-available rather than broken.
  disabled = false,
}) => {
  const c = PALETTE[color] || PALETTE.blue;

  const containerClasses = disabled
    ? `bg-white rounded-xl shadow-sm p-6 sm:p-8 cursor-not-allowed border ${c.border} opacity-70 flex flex-col min-h-[200px] sm:min-h-[240px] lg:min-h-[280px]`
    : `group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 p-6 sm:p-8 cursor-pointer border ${c.border} ${c.hoverBorder} transform hover:-translate-y-1 flex flex-col min-h-[200px] sm:min-h-[240px] lg:min-h-[280px]`;

  return (
    <div onClick={disabled ? undefined : onClick} className={containerClasses}>
      <div className="flex items-center justify-between mb-5 sm:mb-6">
        <div
          className={`w-14 h-14 sm:w-16 sm:h-16 ${c.iconBg} rounded-xl flex items-center justify-center ${disabled ? '' : c.iconHover} transition-colors`}
        >
          <Icon className={`w-7 h-7 sm:w-8 sm:h-8 ${c.icon}`} />
        </div>
      </div>
      <h3 className={`text-xl sm:text-2xl font-semibold text-gray-900 mb-3 sm:mb-4 transition-colors ${disabled ? '' : c.title}`}>
        {title}
      </h3>
      <p className="text-gray-600 text-sm sm:text-base leading-relaxed flex-grow">
        {description}
      </p>
      {disabled ? (
        <span className="mt-3 inline-flex items-center w-fit text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2.5 py-0.5">
          Coming soon
        </span>
      ) : (
        stat && (
          <p className={`mt-3 text-sm sm:text-base font-semibold ${c.stat}`}>
            {stat}
          </p>
        )
      )}
    </div>
  );
};

export default ManagementCard;
