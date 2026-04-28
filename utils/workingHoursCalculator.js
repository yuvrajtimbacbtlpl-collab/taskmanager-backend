/**
 * workingHoursCalculator.js  (backend)
 *
 * HOUR-BASED task scheduler — starts from RIGHT NOW (actual current time).
 *
 * Key behaviour:
 *   Day 1  → clips to max(now, dayStart).  If now >= dayEnd → skip this day entirely.
 *   Day 2+ → always starts from dayStart.
 *
 * Example (user's own case):
 *   Office: Mon-Sat 10:00-20:00   (Saturday IS a working day here)
 *   Now: Saturday 19:04
 *   Hours needed: 2  →  120 mins
 *
 *   Saturday:  19:04 → 20:00  =  56 mins used  (remaining = 64)
 *   Sunday:    OFF → skip
 *   Monday:    10:00 + 64 min  =  11:04
 *   endDate = Monday 11:04 AM  ✅
 */

const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

function parseTime(str) {
  if (!str) return { h: 9, m: 0 };
  const [h, m] = str.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}

function toMins(h, m) { return h * 60 + m; }

function isHoliday(date, holidays = []) {
  return holidays.some(hol => {
    const d = new Date(hol.date);
    return d.getFullYear() === date.getFullYear()
        && d.getMonth()    === date.getMonth()
        && d.getDate()     === date.getDate();
  });
}

function getDayConfig(date, workingHours = []) {
  return workingHours.find(w => w.day === DAY_NAMES[date.getDay()]) || null;
}

/**
 * Productive slots for a day, with breaks cut out.
 * Returns array of {startMin, endMin} in minutes-from-midnight.
 */
function getProductiveSlots(cfg) {
  if (!cfg || !cfg.isWorking) return [];
  const { h: sh, m: sm } = parseTime(cfg.startTime);
  const { h: eh, m: em } = parseTime(cfg.endTime);
  const dayStart = toMins(sh, sm);
  const dayEnd   = toMins(eh, em);

  const breaks = (cfg.breaks || []).map(b => {
    const { h: bsh, m: bsm } = parseTime(b.startTime);
    const { h: beh, m: bem } = parseTime(b.endTime);
    return { start: toMins(bsh, bsm), end: toMins(beh, bem) };
  }).sort((a, b) => a.start - b.start);

  const slots = [];
  let cursor = dayStart;
  for (const brk of breaks) {
    if (brk.start > cursor) slots.push({ startMin: cursor, endMin: Math.min(brk.start, dayEnd) });
    cursor = Math.max(cursor, brk.end);
  }
  if (cursor < dayEnd) slots.push({ startMin: cursor, endMin: dayEnd });
  return slots.filter(s => s.endMin > s.startMin);
}

/**
 * Advance exactly `remainingMins` productive minutes through slots,
 * starting from cursorMin.  Returns { endDate, remainingMins }.
 */
function advanceInSlots(date, cursorMin, remainingMins, slots) {
  let left = remainingMins;
  for (const slot of slots) {
    if (slot.endMin <= cursorMin) continue;
    const from      = Math.max(slot.startMin, cursorMin);
    const available = slot.endMin - from;
    if (available >= left) {
      const endMin = from + left;
      const d = new Date(date);
      d.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
      return { endDate: d, remainingMins: 0 };
    }
    left -= available;
    cursorMin = slot.endMin;
  }
  return { endDate: null, remainingMins: left };
}

/**
 * Main export.
 *
 * @param {Date}   now             - Exact current datetime (start counting from here)
 * @param {number} estimatedHours  - Total working hours needed (decimals OK: 2.5, 8 …)
 * @param {Array}  workingHours    - Company workingHours config array
 * @param {Array}  holidays        - Company holidays array
 *
 * @returns {{
 *   startDateTime: Date,   — the actual moment work begins (now, or next working-day start)
 *   endDate: Date,         — exact datetime when the hours are exhausted
 *   totalHours: number,
 *   skippedDays: number,
 *   workingDayCount: number,
 *   breakdown: Array
 * } | null}
 */
function calculateEndDate(now, estimatedHours, workingHours = [], holidays = []) {
  if (!now || !estimatedHours || estimatedHours <= 0 || !workingHours.length) return null;

  const startNow = new Date(now);   // actual current datetime
  let remainingMins = Math.round(estimatedHours * 60);
  let current       = new Date(startNow);
  current.setHours(0, 0, 0, 0);    // midnight of today

  const nowMins = toMins(startNow.getHours(), startNow.getMinutes()); // current time in mins

  let skippedDays   = 0;
  let workingDayCount = 0;
  const breakdown   = [];
  let startDateTime = null;
  const MAX         = 365;
  let isFirstDay    = true;

  for (let i = 0; i < MAX && remainingMins > 0; i++) {
    const cfg = getDayConfig(current, workingHours);

    if (!cfg || !cfg.isWorking || isHoliday(current, holidays)) {
      skippedDays++;
      isFirstDay = false;
      current.setDate(current.getDate() + 1);
      continue;
    }

    const slots    = getProductiveSlots(cfg);
    const { h: sh, m: sm } = parseTime(cfg.startTime);
    const dayStartMins = toMins(sh, sm);
    const { h: eh, m: em } = parseTime(cfg.endTime);
    const dayEndMins = toMins(eh, em);

    // ── cursor: where we start counting this day ──────────────────────
    // Day 1: start from NOW (clamped to office hours)
    // Day 2+: always from office start
    let cursorMin;
    if (isFirstDay) {
      if (nowMins >= dayEndMins) {
        // Already past office closing — skip today entirely
        skippedDays++;
        isFirstDay = false;
        current.setDate(current.getDate() + 1);
        continue;
      }
      // Clamp: if before office opens, start from office open
      cursorMin = Math.max(nowMins, dayStartMins);
    } else {
      cursorMin = dayStartMins;
    }
    isFirstDay = false;

    // Clip slots to start from cursorMin
    const clippedSlots = slots.map(s => ({
      startMin: Math.max(s.startMin, cursorMin),
      endMin:   s.endMin,
    })).filter(s => s.endMin > s.startMin);

    const dayAvailable = clippedSlots.reduce((sum, s) => sum + (s.endMin - s.startMin), 0);
    if (!dayAvailable) {
      // No productive time left today (e.g. we're in the middle of a break at end of day)
      current.setDate(current.getDate() + 1);
      continue;
    }

    // Record where work actually starts
    if (!startDateTime) {
      const firstSlot = clippedSlots[0];
      startDateTime = new Date(current);
      startDateTime.setHours(Math.floor(firstSlot.startMin / 60), firstSlot.startMin % 60, 0, 0);
    }

    if (remainingMins <= dayAvailable) {
      // Task finishes today
      const { endDate } = advanceInSlots(current, cursorMin, remainingMins, slots);
      const endTime = endDate
        ? `${String(endDate.getHours()).padStart(2,"0")}:${String(endDate.getMinutes()).padStart(2,"0")}`
        : cfg.endTime;
      breakdown.push({
        date:      new Date(current),
        dayName:   DAY_NAMES[current.getDay()],
        startTime: `${String(Math.floor(cursorMin/60)).padStart(2,"0")}:${String(cursorMin%60).padStart(2,"0")}`,
        endTime,
        hoursUsed: parseFloat((remainingMins / 60).toFixed(2)),
        partial:   remainingMins < dayAvailable,
      });
      workingDayCount++;
      return { startDateTime, endDate, totalHours: estimatedHours, skippedDays, workingDayCount, breakdown };
    }

    // Full available time used today, spill to next day
    const { h: dayEndH, m: dayEndM } = { h: Math.floor(dayEndMins/60), m: dayEndMins%60 };
    breakdown.push({
      date:      new Date(current),
      dayName:   DAY_NAMES[current.getDay()],
      startTime: `${String(Math.floor(cursorMin/60)).padStart(2,"0")}:${String(cursorMin%60).padStart(2,"0")}`,
      endTime:   cfg.endTime,
      hoursUsed: parseFloat((dayAvailable / 60).toFixed(2)),
      partial:   false,
    });
    remainingMins   -= dayAvailable;
    workingDayCount++;
    current.setDate(current.getDate() + 1);
  }

  return null;
}

module.exports = { calculateEndDate, getProductiveSlots };
