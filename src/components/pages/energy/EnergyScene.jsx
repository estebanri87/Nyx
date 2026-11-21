import { memo } from 'react';

// Illustrated cross-section of the house. Coordinates use a 1600×900 box;
// the page places its value badges over it in percent of that box.

const DIM = 0.15;

/** Flow line: a dark casing with an animated dash on top while power flows. */
function Flow({ d, color, casing, width = 6, active, reverse = false, slow = false }) {
  const anim = active
    ? `nyx-energy-flow${slow ? ' nyx-energy-flow--slow' : ''}${reverse ? ' nyx-energy-flow--reverse' : ''}`
    : '';
  return (
    <>
      <path d={d} fill="none" stroke={casing} strokeWidth={width + 4} strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        className={anim}
        opacity={active ? 1 : 0.35}
      />
    </>
  );
}

const PANEL = { fill: '#1e3a5f', stroke: '#3b5f8a', strokeWidth: 2 };
// Distance of each panel from the eave along the 512 px long roof slope.
const PANEL_OFFSETS = [34, 129, 224, 319];
const BOX = { fill: 'var(--glass-bg-hover)', stroke: 'var(--glass-border)', strokeWidth: 4 };

function EnergyScene({ view, show, flow, weatherIcon = null }) {
  const pvOpacity = view === 'wp' ? DIM : 1;
  const heatOpacity = view === 'pv' ? DIM : 1;

  return (
    <svg
      viewBox="0 0 1600 900"
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: 0, display: 'block' }}
      aria-hidden="true"
    >
      <rect x="0" y="760" width="1600" height="140" fill="var(--glass-bg)" />
      <line x1="0" y1="760" x2="1600" y2="760" stroke="var(--glass-border)" strokeWidth="3" />
      <polygon
        points="530,272 1010,92 1490,272"
        fill="var(--glass-bg)"
        stroke="var(--glass-border)"
        strokeWidth="4"
      />
      <rect
        x="560"
        y="272"
        width="900"
        height="488"
        fill="var(--glass-bg)"
        stroke="var(--glass-border)"
        strokeWidth="4"
      />
      <line x1="560" y1="520" x2="1460" y2="520" stroke="var(--glass-border)" strokeWidth="4" />
      <circle
        cx="1250"
        cy="390"
        r="30"
        fill="rgba(52,211,153,0.12)"
        stroke="#34d399"
        strokeWidth="4"
      />

      {show.pv && (
        <g className="nyx-energy-part" opacity={pvOpacity}>
          {weatherIcon ? (
            <image href={weatherIcon} x="1410" y="20" width="180" height="180" />
          ) : (
            <>
              <circle cx="1500" cy="110" r="50" fill="rgba(250,204,21,0.18)" />
              <circle cx="1500" cy="110" r="32" fill="#ca8a04" />
            </>
          )}
          {/* Panels on both roof slopes, measured from each eave; they end
              below the ridge so none sticks out over the top. */}
          {[
            'translate(530,272) rotate(-20.56)',
            'translate(1490,272) scale(-1,1) rotate(-20.56)',
          ].map((transform) => (
            <g key={transform} transform={transform}>
              {PANEL_OFFSETS.map((x) => (
                <rect key={x} x={x} y="-30" width="89" height="24" rx="3" {...PANEL} />
              ))}
            </g>
          ))}

          {show.bkw && (
            <>
              <rect
                x="40"
                y="650"
                width="150"
                height="110"
                fill="var(--glass-bg)"
                stroke="var(--glass-border)"
                strokeWidth="4"
              />
              <rect x="40" y="640" width="150" height="12" fill="var(--glass-border)" />
              <g strokeLinecap="round" opacity="0.75">
                <line x1="78" y1="628" x2="132" y2="594" stroke="#3b5f8a" strokeWidth="13" />
                <line x1="132" y1="594" x2="186" y2="628" stroke="#3b5f8a" strokeWidth="13" />
                <line x1="78" y1="628" x2="132" y2="594" stroke="#1e3a5f" strokeWidth="8" />
                <line x1="132" y1="594" x2="186" y2="628" stroke="#1e3a5f" strokeWidth="8" />
              </g>
              <g strokeLinecap="round">
                <line x1="50" y1="638" x2="108" y2="602" stroke="#3b5f8a" strokeWidth="14" />
                <line x1="108" y1="602" x2="166" y2="638" stroke="#3b5f8a" strokeWidth="14" />
                <line x1="50" y1="638" x2="108" y2="602" stroke="#1e3a5f" strokeWidth="9" />
                <line x1="108" y1="602" x2="166" y2="638" stroke="#1e3a5f" strokeWidth="9" />
              </g>
              <Flow
                d="M115 760 V825 H640 V700"
                color="#facc15"
                casing="rgba(250,204,21,0.15)"
                width={4}
                active={flow.bkw}
                slow
              />
            </>
          )}

          <Flow d="M670 290 V560" color="#facc15" casing="rgba(250,204,21,0.15)" active={flow.pv} />
          <rect x="620" y="560" width="100" height="140" rx="10" {...BOX} />
          <rect
            x="636"
            y="582"
            width="68"
            height="28"
            rx="5"
            fill="var(--glass-bg)"
            stroke="var(--glass-border)"
            strokeWidth="2"
          />
          <Flow
            d="M720 590 H740 V470 H1250 V420"
            color="#34d399"
            casing="rgba(52,211,153,0.15)"
            active={flow.house}
          />

          {show.batt && (
            <>
              <Flow
                d="M720 680 H770"
                color="#60a5fa"
                casing="rgba(96,165,250,0.15)"
                active={flow.batt !== 0}
                reverse={flow.batt < 0}
              />
              <rect x="770" y="610" width="90" height="66" rx="8" {...BOX} />
              <rect x="770" y="684" width="90" height="66" rx="8" {...BOX} />
            </>
          )}

          {show.netz && (
            <>
              <rect x="1534" y="420" width="12" height="340" fill="#64748b" />
              <line x1="1500" y1="446" x2="1580" y2="446" stroke="#64748b" strokeWidth="7" />
              <rect x="1500" y="640" width="80" height="90" rx="8" {...BOX} />
              <Flow
                d="M670 700 V790 H1540 V730"
                color="#94a3b8"
                casing="rgba(148,163,184,0.15)"
                width={5}
                active={flow.grid !== 0}
                reverse={flow.grid < 0}
                slow
              />
            </>
          )}
        </g>
      )}

      {show.wp && (
        <g className="nyx-energy-part" opacity={heatOpacity}>
          <rect x="230" y="590" width="240" height="170" rx="18" {...BOX} />
          <circle
            cx="350"
            cy="675"
            r="56"
            fill="var(--glass-bg)"
            stroke="var(--glass-border)"
            strokeWidth="4"
          />
          <g className={flow.heatRun ? 'nyx-energy-fan' : ''} fill="var(--text-muted)">
            <ellipse cx="350" cy="645" rx="11" ry="26" />
            <ellipse cx="350" cy="705" rx="11" ry="26" />
            <ellipse cx="320" cy="675" rx="26" ry="11" />
            <ellipse cx="380" cy="675" rx="26" ry="11" />
          </g>
          {show.pv && (
            <Flow
              d="M620 650 H470"
              color="#34d399"
              casing="rgba(52,211,153,0.15)"
              active={flow.heatRun}
            />
          )}
          <Flow
            d="M470 605 H560 V545 H950 V570"
            color="#f59e0b"
            casing="rgba(245,158,11,0.15)"
            active={flow.heating || flow.dhw}
          />
          <rect x="900" y="570" width="100" height="170" rx="10" {...BOX} />
          <circle
            cx="950"
            cy="680"
            r="20"
            fill="none"
            stroke="var(--glass-border)"
            strokeWidth="4"
          />
          <Flow
            d="M1000 640 H1040"
            color="#f97316"
            casing="rgba(249,115,22,0.15)"
            active={flow.dhw}
          />
          <path d="M1040 560 q45 -24 90 0 V740 q-45 24 -90 0 Z" {...BOX} />
          <path d="M1044 590 q41 -18 82 0 V738 q-41 20 -82 0 Z" fill="#c2410c" opacity="0.45" />
          <path
            d="M985 570 V505 H1000"
            fill="none"
            stroke="rgba(245,158,11,0.25)"
            strokeWidth="8"
          />
          <Flow
            d="M1000 506 h30 v-10 h30 v10 h30 v-10 h30 v10 h30 v-10 h30 v10 h30 v-10 h30 v10 h30 v-10 h30 v10 h30 v-10 h30 v10"
            color="#d97706"
            casing="rgba(217,119,6,0.12)"
            width={5}
            active={flow.heating}
            slow
          />
        </g>
      )}
    </svg>
  );
}

export default memo(EnergyScene);
