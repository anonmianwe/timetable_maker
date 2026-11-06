const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const LUNCH_PERIODS = [4, 5, 6];
const COMPUTER_ROOMS = ["COM1", "COM2", "COM3", "COM4"];
const LAB_ROOMS = ["LAB1", "LAB2"];

function clean(value) {
  return String(value ?? "").trim();
}

function slug(value) {
  return clean(value).toLocaleLowerCase().replace(/[^a-z0-9\u0e00-\u0e7f]+/g, "_").replace(/^_|_$/g, "");
}

function yearNumber(academicYear) {
  const match = clean(academicYear).match(/([1-3])$/);
  return Number(match?.[1] ?? 2);
}

function maxPeriodForYear(academicYear) {
  return yearNumber(academicYear) === 1 ? 9 : 11;
}

function parseDay(value) {
  const text = clean(value).toLocaleLowerCase();
  const aliases = [
    ["monday", "จันทร์"],
    ["tuesday", "อังคาร"],
    ["wednesday", "พุธ"],
    ["thursday", "พฤหัส"],
    ["friday", "ศุกร์"],
  ];
  return aliases.findIndex((terms) => terms.some((term) => text.includes(term)));
}

function parsePeriodRange(value) {
  const match = clean(value).match(/(?:periods?|คาบ(?:ที่)?)\s*(\d+)\s*[-–]\s*(\d+)/i);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]) };
}

function parseFixedRequirement(value, duration, label, errors) {
  const text = clean(value);
  if (!text) return null;
  const day = parseDay(text);
  const range = parsePeriodRange(text);
  if (day < 0 || !range) {
    errors.push(`${label}: cannot interpret the fixed day/period requirement "${text}".`);
    return null;
  }
  if (range.end < range.start || range.end - range.start + 1 !== duration) {
    errors.push(`${label}: fixed periods ${range.start}-${range.end} do not match the ${duration}-period course duration.`);
    return null;
  }
  return { day, start: range.start, end: range.end };
}

function getRoomOptions(requirement, academicYear, label, errors, assumptions) {
  const text = clean(requirement);
  if (!text) {
    errors.push(`${label}: room requirement is missing.`);
    return [];
  }

  const needsComputer = /computer|คอมพิวเตอร์/i.test(text);
  const needsLab = /laboratory|\blab\b|ปฏิบัติการ/i.test(text);
  if (needsComputer && needsLab) return [...COMPUTER_ROOMS, ...LAB_ROOMS].map((name) => ({ id: name, name }));
  if (needsComputer) return COMPUTER_ROOMS.map((name) => ({ id: name, name }));
  if (needsLab) return LAB_ROOMS.map((name) => ({ id: name, name }));

  if (/department|แผนกวิชา/i.test(text)) {
    assumptions.add("Department-room entries use one placeholder room per academic year because no physical department-room inventory was supplied.");
    const id = `DEPARTMENT_${slug(academicYear)}`;
    return [{ id, name: `Department space (${academicYear})` }];
  }

  assumptions.add("External room inventory is unknown; one placeholder per room type and academic year is used until the real inventory is provided.");
  const id = `EXTERNAL_${slug(text)}_${slug(academicYear)}`;
  return [{ id, name: `${text} (${academicYear})` }];
}

function getTeacherLimits(position) {
  const text = clean(position).toLocaleLowerCase();
  if (/department head|section head|หัวหน้าแผนก|หัวหน้างาน/.test(text)) return { min: 24, max: 28 };
  if (/department instructor|ครูประจำแผนก/.test(text)) return { min: 30, max: 38 };
  return { min: 0, max: 38 };
}

function getUnavailableSlots(requirement, teacherName, errors) {
  const text = clean(requirement);
  const unavailable = new Set();
  if (!text) return unavailable;
  const day = parseDay(text);
  const range = parsePeriodRange(text);
  if (day < 0 || !range || range.end < range.start) {
    errors.push(`Teacher ${teacherName}: cannot interpret availability note "${text}".`);
    return unavailable;
  }
  for (let period = range.start; period <= range.end; period += 1) {
    unavailable.add(`${day}_${period}`);
  }
  return unavailable;
}

function normalizeInput(records, options) {
  const errors = [];
  const assumptions = new Set([
    "One workbook hour is treated as one timetable period, and each course is one uninterrupted weekly block.",
    "Lunch may vary by student group and weekday; each group receives one break in periods 4-6 per weekday.",
    "The two practical sections of a course are scheduled at the same time as a symmetry-breaking heuristic, with separate teachers and rooms.",
    "All listed teachers may teach any course. General-education lessons are excluded from teacher workload totals.",
    "Room availability and capacity were not supplied, so listed rooms are assumed available and capacity is not checked.",
  ]);
  const sourceRecords = Array.isArray(records) ? records : [];
  const teacherRecords = sourceRecords.filter((record) => record.sourceType === "teachers");
  const courseRecords = sourceRecords.filter((record) => record.sourceType === "courses");

  const teachers = teacherRecords.map((record, index) => {
    const name = clean(record.teacherName);
    if (!name) errors.push(`Teacher row ${record.sourceRow ?? index + 1}: name is missing.`);
    return {
      id: `teacher_${index}`,
      name: name || `Teacher ${index + 1}`,
      position: clean(record.position),
      limits: getTeacherLimits(record.position),
      unavailable: getUnavailableSlots(record.availability, name || `row ${index + 1}`, errors),
    };
  });

  const events = [];
  for (const [index, course] of courseRecords.entries()) {
    const label = clean(course.courseCode) || clean(course.courseName) || `course row ${course.sourceRow ?? index + 1}`;
    const duration = Number(course.hours);
    const typeText = clean(course.courseType).toLocaleLowerCase();
    const practical = /practical|ปฏิบัติ/.test(typeText);
    const theory = /theory|ทฤษฎี/.test(typeText);
    const academicYear = clean(course.academicYear);
    const groupIds = Array.isArray(course.groupIds) ? course.groupIds : [];

    if (!clean(course.courseCode) || !clean(course.courseName)) errors.push(`${label}: course code or name is missing.`);
    if (!Number.isInteger(duration) || duration < 1) errors.push(`${label}: course hours must be a positive whole number.`);
    if (!practical && !theory) errors.push(`${label}: course type must be Theory or Practical.`);
    if (!academicYear) errors.push(`${label}: academic year is missing.`);
    if (groupIds.length < 2) errors.push(`${label}: both student groups must be identified.`);
    if (errors.some((error) => error.startsWith(`${label}:`))) continue;

    const fixed = parseFixedRequirement(course.requirements, duration, label, errors);
    const rooms = getRoomOptions(course.roomRequirement, academicYear, label, errors, assumptions);
    if (rooms.length === 0) continue;

    const lessonGroups = practical ? groupIds.map((groupId) => [groupId]) : [groupIds];
    for (const [sectionIndex, groups] of lessonGroups.entries()) {
      events.push({
        id: `event_${events.length}`,
        courseCode: clean(course.courseCode),
        courseName: clean(course.courseName),
        academicYear,
        groupIds: groups,
        duration,
        courseType: practical ? "practical" : "theory",
        category: clean(course.category) || "department",
        countsTowardWorkload: clean(course.category) !== "general_education",
        fixed,
        rooms,
        sourceSheet: clean(course.sourceSheet),
        sourceRow: course.sourceRow,
        sectionIndex,
      });
    }
  }

  if (teachers.length === 0) errors.push("No teachers were imported.");
  if (events.length === 0) errors.push("No schedulable course events were imported.");
  if (!options.enforceTeacherWorkload) assumptions.add("Teacher minimum/maximum workloads are disabled for this run.");

  return { teachers, events, errors, assumptions: [...assumptions] };
}

function buildPlacements(events) {
  const placements = [];
  for (const [eventIndex, event] of events.entries()) {
    const maxPeriod = maxPeriodForYear(event.academicYear);
    const candidates = [];
    for (let day = 0; day < DAYS.length; day += 1) {
      if (event.fixed && day !== event.fixed.day) continue;
      const finalStart = maxPeriod - event.duration + 1;
      for (let start = 1; start <= finalStart; start += 1) {
        const end = start + event.duration - 1;
        if (event.fixed && start !== event.fixed.start) continue;
        candidates.push({ eventIndex, eventId: event.id, day, start, end });
      }
    }
    if (candidates.length === 0) return { placements, error: `${event.courseCode}: no possible day/period placement within its year limit.` };
    placements.push(...candidates);
  }
  return { placements, error: "" };
}

function roomPool(event) {
  const ids = event.rooms.map((room) => room.id);
  if (ids.length > 0 && ids.every((id) => COMPUTER_ROOMS.includes(id))) return { key: "computer", capacity: COMPUTER_ROOMS.length };
  if (ids.length > 0 && ids.every((id) => LAB_ROOMS.includes(id))) return { key: "laboratory", capacity: LAB_ROOMS.length };
  if (ids.length === 1) return { key: `room_${ids[0]}`, capacity: 1 };
  return null;
}

function validateGroupPlacements(events, placements) {
  const groupSlots = new Map();
  const groupYears = new Map();
  for (const placement of placements) {
    const event = events[placement.eventIndex];
    for (const groupId of event.groupIds) {
      groupYears.set(groupId, event.academicYear);
      const key = `${groupId}_${placement.day}`;
      groupSlots.set(key, groupSlots.get(key) ?? new Set());
      for (let period = placement.start; period <= placement.end; period += 1) groupSlots.get(key).add(period);
    }
  }

  const errors = [];
  for (const [groupId, academicYear] of groupYears) {
    for (let day = 0; day < DAYS.length; day += 1) {
      const periods = groupSlots.get(`${groupId}_${day}`) ?? new Set();
      if (!periods.has(1)) errors.push(`${groupId} has no lesson in period 1 on ${DAYS[day]}.`);
      const lunchSlots = LUNCH_PERIODS.filter((period) => !periods.has(period));
      if (lunchSlots.length !== 1) errors.push(`${groupId} must have exactly one lunch break in periods 4-6 on ${DAYS[day]}.`);
      const lastPeriod = Math.max(0, ...periods);
      for (let period = 1; period <= lastPeriod; period += 1) {
        if (period !== lunchSlots[0] && !periods.has(period)) errors.push(`${groupId} has a gap on ${DAYS[day]} period ${period}.`);
      }
      if (lastPeriod > maxPeriodForYear(academicYear)) errors.push(`${groupId} exceeds its daily period limit on ${DAYS[day]}.`);
    }
  }
  return errors;
}

function canPackRuns(runLengths, courseDurations) {
  if (runLengths.reduce((total, length) => total + length, 0) !== courseDurations.reduce((total, duration) => total + duration, 0)) return false;
  const runs = [...runLengths].sort((left, right) => right - left);
  const courses = [...courseDurations].sort((left, right) => right - left);
  const failed = new Set();

  function pack(index) {
    if (index === courses.length) return runs.every((remaining) => remaining === 0);
    const state = `${index}:${runs.join(",")}`;
    if (failed.has(state)) return false;
    const duration = courses[index];
    const triedRuns = new Set();
    for (let run = 0; run < runs.length; run += 1) {
      if (runs[run] < duration || triedRuns.has(runs[run])) continue;
      triedRuns.add(runs[run]);
      runs[run] -= duration;
      if (pack(index + 1)) return true;
      runs[run] += duration;
    }
    failed.add(state);
    return false;
  }

  return pack(0);
}

function chooseLunch(groupId, day, endPeriod, fixedSlots, flexibleCourses) {
  for (const lunch of [5, 4, 6]) {
    if (lunch > endPeriod || fixedSlots.has(lunch)) continue;
    const runLengths = [];
    let runLength = 0;
    for (let period = 1; period <= endPeriod; period += 1) {
      if (period === lunch || fixedSlots.has(period)) {
        if (runLength) runLengths.push(runLength);
        runLength = 0;
      } else {
        runLength += 1;
      }
    }
    if (runLength) runLengths.push(runLength);
    if (canPackRuns(runLengths, flexibleCourses.map((course) => course.duration))) return lunch;
  }
  return 0;
}

function buildDailyPlan(events, dayPlanSeed = 0) {
  const groups = new Map();
  const fixedSlots = new Map();
  const fixedEnd = new Map();
  const courseDays = new Map();

  for (const event of events) {
    for (const groupId of event.groupIds) {
      const current = groups.get(groupId) ?? { academicYear: event.academicYear, courses: new Map() };
      current.courses.set(event.courseCode, event);
      groups.set(groupId, current);
      if (!event.fixed) continue;
      const dayKey = `${groupId}_${event.fixed.day}`;
      fixedEnd.set(dayKey, Math.max(fixedEnd.get(dayKey) ?? 0, event.fixed.end));
      const periods = fixedSlots.get(dayKey) ?? new Set();
      for (let period = event.fixed.start; period <= event.fixed.end; period += 1) periods.add(period);
      fixedSlots.set(dayKey, periods);
    }
  }

  const lunches = new Map();
  const ends = new Map();
  for (const [groupId, group] of groups) {
    const maxPeriod = maxPeriodForYear(group.academicYear);
    const coursesByDay = Array.from({ length: DAYS.length }, (_, day) => [...group.courses.values()].filter((course) => course.fixed?.day === day));
    const fixedLoads = coursesByDay.map((courses) => courses.reduce((total, course) => total + course.duration, 0));
    const flexibleCourses = [...group.courses.values()]
      .filter((course) => !course.fixed)
      .sort((left, right) => right.duration - left.duration || left.courseCode.localeCompare(right.courseCode));
    const maxLoad = maxPeriod - 1;
    const dayLoads = [...fixedLoads];
    const dailyCourses = coursesByDay.map((courses) => [...courses]);
    const groupCourseDays = new Map(coursesByDay.flatMap((courses, day) => courses.map((course) => [course.courseCode, day])));
    let chosenLunches = null;

    function assignCourse(index) {
      if (index === flexibleCourses.length) {
        const dayLunches = [];
        for (let day = 0; day < DAYS.length; day += 1) {
          const endPeriod = dayLoads[day] + 1;
          const dayKey = `${groupId}_${day}`;
          if (endPeriod > maxPeriod || endPeriod < (fixedEnd.get(dayKey) ?? 0)) return false;
          const fixed = fixedSlots.get(dayKey) ?? new Set();
          const flexible = dailyCourses[day].filter((course) => !course.fixed);
          const lunch = chooseLunch(groupId, day, endPeriod, fixed, flexible);
          if (!lunch) return false;
          dayLunches.push(lunch);
        }
        chosenLunches = dayLunches;
        return true;
      }

      const course = flexibleCourses[index];
      const candidateDays = DAYS.map((_, day) => day)
        .filter((day) => dayLoads[day] + course.duration <= maxLoad)
        .sort((left, right) => dayLoads[left] - dayLoads[right]
          || ((left - dayPlanSeed + DAYS.length) % DAYS.length) - ((right - dayPlanSeed + DAYS.length) % DAYS.length));
      const seen = new Set();
      for (const day of candidateDays) {
        const dayKey = `${groupId}_${day}`;
        const signature = `${dayLoads[day]}_${fixedEnd.get(dayKey) ?? 0}_${[...(fixedSlots.get(dayKey) ?? [])].join(",")}_${dailyCourses[day].map((item) => item.duration).sort().join(",")}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        dayLoads[day] += course.duration;
        dailyCourses[day].push(course);
        groupCourseDays.set(course.courseCode, day);
        if (assignCourse(index + 1)) return true;
        groupCourseDays.delete(course.courseCode);
        dailyCourses[day].pop();
        dayLoads[day] -= course.duration;
      }
      return false;
    }

    if (!assignCourse(0)) {
      return { error: `${groupId} course blocks cannot be packed into weekdays while preserving fixed lessons, lunch, and period limits.` };
    }

    for (let day = 0; day < DAYS.length; day += 1) {
      const dayKey = `${groupId}_${day}`;
      lunches.set(dayKey, chosenLunches[day]);
      ends.set(dayKey, dayLoads[day] + 1);
    }
    for (const [courseCode, day] of groupCourseDays) {
      const key = `${group.academicYear}_${courseCode}`;
      const existing = courseDays.get(key);
      if (existing !== undefined && existing !== day) {
        return { error: `${courseCode} was assigned to different weekdays for groups in ${group.academicYear}.` };
      }
      courseDays.set(key, day);
    }
  }
  return { lunches, ends, courseDays, error: "" };
}

function solvePlacementsForPlan(events, placements, teachers, options, dailyPlan) {
  const domains = events.map(() => []);
  placements.forEach((placement) => {
    const event = events[placement.eventIndex];
    const plannedDay = dailyPlan.courseDays.get(`${event.academicYear}_${event.courseCode}`);
    if (plannedDay === undefined || plannedDay === placement.day) domains[placement.eventIndex].push(placement);
  });
  const practicalEvents = new Map();
  for (const [eventIndex, event] of events.entries()) {
    if (event.courseType !== "practical") continue;
    const key = `${event.academicYear}_${event.courseCode}`;
    practicalEvents.set(key, [...(practicalEvents.get(key) ?? []), eventIndex]);
  }
  const practicalPairs = new Map();
  for (const indices of practicalEvents.values()) {
    if (indices.length === 2) {
      practicalPairs.set(indices[0], indices[1]);
      practicalPairs.set(indices[1], indices[0]);
    }
  }
  const teacherCapacity = new Map();
  for (let day = 0; day < DAYS.length; day += 1) {
    for (let period = 1; period <= 11; period += 1) {
      teacherCapacity.set(`${day}_${period}`, teachers.filter((teacher) => !teacher.unavailable.has(`${day}_${period}`)).length);
    }
  }

  const groupSlots = new Set();
  const groupSlotOwners = new Map();
  const teacherDemand = new Map();
  const roomDemand = new Map();
  const dailyLoads = new Map();
  const selected = new Array(events.length);
  const maxSearchNodes = Math.max(1000, options.maxSearchNodes ?? 5000);
  const maxPlacementAttempts = Math.max(1, options.maxPlacementAttempts ?? 8);
  const maxResourceSearchNodes = Math.max(1000, options.maxResourceSearchNodes ?? 50000);
  let visitedNodes = 0;
  let placementAttempts = 0;
  let searchLimitReached = false;
  let resourceSearchLimitReached = false;
  let resourceAssignments = null;
  let blockingEvent = "";
  let groupValidationFailures = 0;
  let firstGroupValidationErrors = [];
  const rejectionCounts = new Map();

  function rejectPlacement(reason) {
    rejectionCounts.set(reason, (rejectionCounts.get(reason) ?? 0) + 1);
    return false;
  }

  function nextRunStart(groupId, day) {
    const key = `${groupId}_${day}`;
    const lunch = dailyPlan.lunches.get(key);
    const end = dailyPlan.ends.get(key);
    for (let period = 1; period < lunch; period += 1) {
      if (!groupSlots.has(`${groupId}_${day}_${period}`)) return period;
    }
    for (let period = lunch + 1; period <= end; period += 1) {
      if (!groupSlots.has(`${groupId}_${day}_${period}`)) return period;
    }
    return 0;
  }

  function isAvailable(placement) {
    const event = events[placement.eventIndex];
    const pool = roomPool(event);
    for (const groupId of event.groupIds) {
      const dayKey = `${groupId}_${placement.day}`;
      if (placement.start !== nextRunStart(groupId, placement.day)) return rejectPlacement("not the next contiguous group slot");
      if (placement.end > dailyPlan.ends.get(dayKey)) return rejectPlacement("past the planned daily end period");
      const lunch = dailyPlan.lunches.get(dayKey);
      if (placement.start <= lunch && placement.end >= lunch) return rejectPlacement("crosses the planned lunch period");
      for (let period = placement.start; period <= placement.end; period += 1) {
        if (groupSlots.has(`${groupId}_${placement.day}_${period}`)) return rejectPlacement("student-group overlap");
      }
    }
    for (let period = placement.start; period <= placement.end; period += 1) {
      const slot = `${placement.day}_${period}`;
      if ((teacherDemand.get(slot) ?? 0) + 1 > teacherCapacity.get(slot)) return rejectPlacement("teacher capacity");
      if (pool && (roomDemand.get(`${pool.key}_${slot}`) ?? 0) + 1 > pool.capacity) return rejectPlacement("room capacity");
    }
    return true;
  }

  function placementScore(placement) {
    const event = events[placement.eventIndex];
    let score = placement.day * 0.001 + placement.start * 0.0001;
    for (const groupId of event.groupIds) {
      const key = `${groupId}_${placement.day}`;
      const load = dailyLoads.get(key) ?? 0;
      score += (load + event.duration) ** 2 - load ** 2;
      const occupied = groupSlots.has(`${groupId}_${placement.day}_1`)
        || Array.from({ length: 11 }, (_, index) => index + 1)
          .some((period) => groupSlots.has(`${groupId}_${placement.day}_${period}`));
      if (!occupied) {
        score += placement.start === 1 ? -1000 : 1000;
      } else {
        const extendsBefore = placement.start > 1 && groupSlots.has(`${groupId}_${placement.day}_${placement.start - 1}`);
        const extendsAfter = groupSlots.has(`${groupId}_${placement.day}_${placement.end + 1}`);
        if (extendsBefore || extendsAfter) score -= 100;
        else score += 100;
      }
    }
    return score;
  }

  function applyPlacement(placement, add) {
    const event = events[placement.eventIndex];
    const delta = add ? 1 : -1;
    const loadDelta = add ? event.duration : -event.duration;
    const pool = roomPool(event);
    for (const groupId of event.groupIds) {
      const dayKey = `${groupId}_${placement.day}`;
      dailyLoads.set(dayKey, (dailyLoads.get(dayKey) ?? 0) + loadDelta);
      for (let period = placement.start; period <= placement.end; period += 1) {
        const key = `${groupId}_${placement.day}_${period}`;
        if (add) groupSlots.add(key);
        else groupSlots.delete(key);
        if (add) groupSlotOwners.set(key, placement.eventIndex);
        else groupSlotOwners.delete(key);
      }
    }
    for (let period = placement.start; period <= placement.end; period += 1) {
      const slot = `${placement.day}_${period}`;
      const nextTeacherDemand = (teacherDemand.get(slot) ?? 0) + delta;
      if (nextTeacherDemand) teacherDemand.set(slot, nextTeacherDemand);
      else teacherDemand.delete(slot);
      if (pool) {
        const key = `${pool.key}_${slot}`;
        const nextRoomDemand = (roomDemand.get(key) ?? 0) + delta;
        if (nextRoomDemand) roomDemand.set(key, nextRoomDemand);
        else roomDemand.delete(key);
      }
    }
  }

  function getPlacementBundles(eventIndex) {
    const partnerIndex = practicalPairs.get(eventIndex);
    const available = domains[eventIndex].filter(isAvailable);
    if (partnerIndex === undefined) return available.map((placement) => [placement]);

    return available.flatMap((placement) => {
      const partner = domains[partnerIndex].find((candidate) => (
        candidate.day === placement.day
        && candidate.start === placement.start
        && candidate.end === placement.end
      ));
      if (!partner) return [];

      applyPlacement(placement, true);
      const partnerAvailable = isAvailable(partner);
      applyPlacement(placement, false);
      return partnerAvailable ? [[placement, partner]] : [];
    });
  }

  function search(remaining) {
    visitedNodes += 1;
    if (visitedNodes > maxSearchNodes) {
      searchLimitReached = true;
      return false;
    }
    if (remaining.length === 0) {
      const selectedPlacements = selected.filter(Boolean);
      const groupErrors = validateGroupPlacements(events, selectedPlacements);
      if (groupErrors.length) {
        groupValidationFailures += 1;
        if (firstGroupValidationErrors.length === 0) firstGroupValidationErrors = groupErrors.slice(0, 5);
        return false;
      }
      placementAttempts += 1;
      if (placementAttempts > maxPlacementAttempts) {
        searchLimitReached = true;
        return false;
      }
      const resources = solveResources(events, selectedPlacements, teachers, options.enforceTeacherWorkload !== false, maxResourceSearchNodes);
      if (resources.assignments) {
        resourceAssignments = resources.assignments;
        return true;
      }
      resourceSearchLimitReached ||= resources.hitSearchLimit;
      return false;
    }

    let selectedIndex = -1;
    let selectedOptions = null;
    for (let index = 0; index < remaining.length; index += 1) {
      const eventIndex = remaining[index];
      const available = getPlacementBundles(eventIndex);
      if (available.length === 0) {
        continue;
      }
      if (selectedOptions === null || available.length < selectedOptions.length) {
        selectedIndex = index;
        selectedOptions = available;
        if (available.length === 1) break;
      }
    }

    if (selectedOptions === null) {
      const event = events[remaining[0]];
      blockingEvent = `${event.courseCode} (${event.academicYear}) has no placement compatible with the current group, lunch, teacher, and room assignments.`;
      return false;
    }

    selectedOptions.sort((left, right) => (
      left.reduce((score, placement) => score + placementScore(placement), 0)
      - right.reduce((score, placement) => score + placementScore(placement), 0)
    ));
    for (const bundle of selectedOptions) {
      const bundleIndices = new Set(bundle.map((placement) => placement.eventIndex));
      const nextRemaining = remaining.filter((eventIndex) => !bundleIndices.has(eventIndex));
      for (const placement of bundle) {
        selected[placement.eventIndex] = placement;
        applyPlacement(placement, true);
      }
      if (search(nextRemaining)) return true;
      for (const placement of [...bundle].reverse()) {
        applyPlacement(placement, false);
        selected[placement.eventIndex] = undefined;
      }
      if (searchLimitReached) return false;
    }
    return false;
  }

  const found = search(events.map((_, index) => index));
  return {
    assignments: found ? resourceAssignments : null,
    placementAttempts,
    visitedNodes,
    searchLimitReached,
    resourceSearchLimitReached,
    blockingEvent,
    groupValidationFailures,
    firstGroupValidationErrors,
    rejectionReasons: [...rejectionCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3).map(([reason, count]) => `${reason}: ${count}`),
    dailyPlan: { lunches: Object.fromEntries(dailyPlan.lunches), ends: Object.fromEntries(dailyPlan.ends) },
  };
}

function solvePlacements(events, placements, teachers, options) {
  const maxPlans = Math.max(1, Math.min(25, options.maxDailyPlanAttempts ?? 25));
  const combined = {
    assignments: null,
    placementAttempts: 0,
    visitedNodes: 0,
    searchLimitReached: false,
    resourceSearchLimitReached: false,
    blockingEvent: "",
    groupValidationFailures: 0,
    firstGroupValidationErrors: [],
    rejectionReasons: [],
    dailyPlan: null,
    dailyPlanAttempts: 0,
  };

  for (let seed = 0; seed < maxPlans; seed += 1) {
    const dailyPlan = buildDailyPlan(events, seed);
    if (dailyPlan.error) {
      combined.blockingEvent = dailyPlan.error;
      continue;
    }
    const result = solvePlacementsForPlan(events, placements, teachers, options, dailyPlan);
    combined.dailyPlanAttempts = seed + 1;
    combined.placementAttempts += result.placementAttempts;
    combined.visitedNodes += result.visitedNodes;
    combined.groupValidationFailures += result.groupValidationFailures;
    combined.searchLimitReached ||= result.searchLimitReached;
    combined.resourceSearchLimitReached ||= result.resourceSearchLimitReached;
    combined.blockingEvent = result.blockingEvent || combined.blockingEvent;
    if (result.firstGroupValidationErrors.length) combined.firstGroupValidationErrors = result.firstGroupValidationErrors;
    if (result.rejectionReasons.length) combined.rejectionReasons = result.rejectionReasons;
    combined.dailyPlan = result.dailyPlan;
    if (result.assignments) return { ...combined, assignments: result.assignments };
  }
  combined.searchLimitReached = true;
  return combined;
}

function solveResources(events, selectedPlacements, teachers, enforceTeacherWorkload, maxSearchNodes = 500000) {
  const optionsByPlacement = selectedPlacements.map((placement) => {
    const event = events[placement.eventIndex];
    const options = [];
    for (const teacher of teachers) {
      const unavailable = Array.from({ length: event.duration }, (_, index) => placement.start + index)
        .some((period) => teacher.unavailable.has(`${placement.day}_${period}`));
      if (unavailable) continue;
      for (const room of event.rooms) options.push({ ...placement, event, teacher, room });
    }
    return { placement, event, options };
  });
  if (optionsByPlacement.some((entry) => entry.options.length === 0)) {
    return { assignments: null, hitSearchLimit: false, visitedNodes: 0 };
  }

  const teacherSlots = new Set();
  const roomSlots = new Set();
  const teacherLoads = new Map(teachers.map((teacher) => [teacher.id, 0]));
  const assignments = new Array(selectedPlacements.length);
  let visitedNodes = 0;
  let hitSearchLimit = false;

  function getAvailableOptions(entry) {
    const { event, options } = entry;
    return options.filter((option) => {
      if (enforceTeacherWorkload && event.countsTowardWorkload) {
        const load = teacherLoads.get(option.teacher.id) ?? 0;
        if (load + event.duration > option.teacher.limits.max) return false;
      }
      for (let period = option.start; period <= option.end; period += 1) {
        if (teacherSlots.has(`${option.teacher.id}_${option.day}_${period}`)) return false;
        if (roomSlots.has(`${option.room.id}_${option.day}_${period}`)) return false;
      }
      return true;
    });
  }

  function hasFeasibleRemainingLoad(remaining) {
    if (!enforceTeacherWorkload) return true;
    const remainingHours = remaining.reduce((total, entry) => total + (entry.event.countsTowardWorkload ? entry.event.duration : 0), 0);
    const totalMinimumDeficit = teachers.reduce((total, teacher) => total + Math.max(0, teacher.limits.min - (teacherLoads.get(teacher.id) ?? 0)), 0);
    const totalRemainingCapacity = teachers.reduce((total, teacher) => total + Math.max(0, teacher.limits.max - (teacherLoads.get(teacher.id) ?? 0)), 0);
    if (totalMinimumDeficit > remainingHours || totalRemainingCapacity < remainingHours) return false;

    for (const teacher of teachers) {
      let possibleHours = 0;
      for (const entry of remaining) {
        if (!entry.event.countsTowardWorkload) continue;
        if (getAvailableOptions(entry).some((option) => option.teacher.id === teacher.id)) possibleHours += entry.event.duration;
      }
      if ((teacherLoads.get(teacher.id) ?? 0) + possibleHours < teacher.limits.min) return false;
    }
    return true;
  }

  function search(remaining) {
    visitedNodes += 1;
    if (visitedNodes > maxSearchNodes) {
      hitSearchLimit = true;
      return false;
    }
    if (remaining.length === 0) {
      return !enforceTeacherWorkload || teachers.every((teacher) => {
        const load = teacherLoads.get(teacher.id) ?? 0;
        return load >= teacher.limits.min && load <= teacher.limits.max;
      });
    }
    if (!hasFeasibleRemainingLoad(remaining)) return false;

    let selectedIndex = -1;
    let selectedOptions = null;
    for (let index = 0; index < remaining.length; index += 1) {
      const availableOptions = getAvailableOptions(remaining[index]);
      if (availableOptions.length === 0) return false;
      if (selectedOptions === null || availableOptions.length < selectedOptions.length) {
        selectedIndex = index;
        selectedOptions = availableOptions;
        if (availableOptions.length === 1) break;
      }
    }

    const entry = remaining[selectedIndex];
    selectedOptions.sort((left, right) => {
      const leftLoad = teacherLoads.get(left.teacher.id) ?? 0;
      const rightLoad = teacherLoads.get(right.teacher.id) ?? 0;
      const leftDeficit = enforceTeacherWorkload && entry.event.countsTowardWorkload
        ? Math.max(0, left.teacher.limits.min - leftLoad - entry.event.duration)
        : 0;
      const rightDeficit = enforceTeacherWorkload && entry.event.countsTowardWorkload
        ? Math.max(0, right.teacher.limits.min - rightLoad - entry.event.duration)
        : 0;
      return leftDeficit - rightDeficit || leftLoad - rightLoad || left.room.id.localeCompare(right.room.id);
    });

    const nextRemaining = remaining.filter((_, index) => index !== selectedIndex);
    for (const option of selectedOptions) {
      assignments[selectedPlacements.indexOf(entry.placement)] = option;
      for (let period = option.start; period <= option.end; period += 1) {
        teacherSlots.add(`${option.teacher.id}_${option.day}_${period}`);
        roomSlots.add(`${option.room.id}_${option.day}_${period}`);
      }
      if (entry.event.countsTowardWorkload) {
        teacherLoads.set(option.teacher.id, (teacherLoads.get(option.teacher.id) ?? 0) + entry.event.duration);
      }

      if (search(nextRemaining)) return true;

      if (entry.event.countsTowardWorkload) {
        teacherLoads.set(option.teacher.id, (teacherLoads.get(option.teacher.id) ?? 0) - entry.event.duration);
      }
      for (let period = option.start; period <= option.end; period += 1) {
        teacherSlots.delete(`${option.teacher.id}_${option.day}_${period}`);
        roomSlots.delete(`${option.room.id}_${option.day}_${period}`);
      }
      assignments[selectedPlacements.indexOf(entry.placement)] = undefined;
      if (hitSearchLimit) return false;
    }
    return false;
  }

  const found = search(optionsByPlacement);
  return {
    assignments: found ? assignments.filter(Boolean) : null,
    hitSearchLimit,
    visitedNodes,
  };
}

function validateSchedule(events, assignments, teachers, enforceTeacherWorkload) {
  const errors = [];
  if (assignments.length !== events.length) errors.push(`Expected ${events.length} scheduled lessons but received ${assignments.length}.`);
  const eventCounts = new Map();
  const groupSlots = new Map();
  const teacherSlots = new Map();
  const roomSlots = new Map();
  const teacherLoads = new Map(teachers.map((teacher) => [teacher.id, 0]));

  for (const assignment of assignments) {
    eventCounts.set(assignment.eventId, (eventCounts.get(assignment.eventId) ?? 0) + 1);
    const event = events.find((item) => item.id === assignment.eventId);
    if (!event) {
      errors.push(`Unknown lesson event ${assignment.eventId}.`);
      continue;
    }
    if (assignment.endPeriod - assignment.startPeriod + 1 !== event.duration) {
      errors.push(`${event.courseCode}: assigned block duration is incorrect.`);
    }
    if (event.fixed && (assignment.dayIndex !== event.fixed.day || assignment.startPeriod !== event.fixed.start)) {
      errors.push(`${event.courseCode}: fixed day/period requirement was not met.`);
    }
    if (assignment.endPeriod > maxPeriodForYear(event.academicYear)) {
      errors.push(`${event.courseCode}: exceeds the maximum period for ${event.academicYear}.`);
    }
    if (event.countsTowardWorkload) {
      teacherLoads.set(assignment.teacherId, (teacherLoads.get(assignment.teacherId) ?? 0) + event.duration);
    }

    for (const period of assignment.periods) {
      for (const groupId of event.groupIds) {
        const key = `${groupId}_${assignment.dayIndex}_${period}`;
        if (groupSlots.has(key)) errors.push(`${groupId} has overlapping lessons on ${DAYS[assignment.dayIndex]} period ${period}.`);
        groupSlots.set(key, event.id);
      }
      const teacherKey = `${assignment.teacherId}_${assignment.dayIndex}_${period}`;
      if (teacherSlots.has(teacherKey)) errors.push(`${assignment.teacherName} has overlapping lessons on ${DAYS[assignment.dayIndex]} period ${period}.`);
      teacherSlots.set(teacherKey, event.id);
      const roomKey = `${assignment.roomId}_${assignment.dayIndex}_${period}`;
      if (roomSlots.has(roomKey)) errors.push(`${assignment.roomName} has overlapping lessons on ${DAYS[assignment.dayIndex]} period ${period}.`);
      roomSlots.set(roomKey, event.id);
      const teacher = teachers.find((item) => item.id === assignment.teacherId);
      if (teacher?.unavailable.has(`${assignment.dayIndex}_${period}`)) {
        errors.push(`${assignment.teacherName} is unavailable on ${DAYS[assignment.dayIndex]} period ${period}.`);
      }
    }
  }

  for (const event of events) {
    if (eventCounts.get(event.id) !== 1) errors.push(`${event.courseCode}: expected exactly one lesson block for ${event.groupIds.join(", ")}.`);
  }

  const groupYears = new Map();
  for (const event of events) {
    for (const groupId of event.groupIds) groupYears.set(groupId, event.academicYear);
  }
  for (const [groupId, academicYear] of groupYears) {
    for (let day = 0; day < DAYS.length; day += 1) {
      const periods = new Set();
      for (const assignment of assignments) {
        const event = events.find((item) => item.id === assignment.eventId);
        if (event?.groupIds.includes(groupId) && assignment.dayIndex === day) {
          assignment.periods.forEach((period) => periods.add(period));
        }
      }
      if (!periods.has(1)) errors.push(`${groupId} has no lesson in period 1 on ${DAYS[day]}.`);
      const lunchSlots = LUNCH_PERIODS.filter((period) => !periods.has(period));
      if (lunchSlots.length !== 1) errors.push(`${groupId} must have exactly one lunch break in periods 4-6 on ${DAYS[day]}.`);
      const lastPeriod = Math.max(0, ...periods);
      const lunch = lunchSlots[0];
      for (let period = 1; period <= lastPeriod; period += 1) {
        if (period !== lunch && !periods.has(period)) errors.push(`${groupId} has a gap on ${DAYS[day]} period ${period}.`);
      }
      if (lastPeriod > maxPeriodForYear(academicYear)) errors.push(`${groupId} exceeds its daily period limit on ${DAYS[day]}.`);
    }
  }

  if (enforceTeacherWorkload) {
    for (const teacher of teachers) {
      const load = teacherLoads.get(teacher.id) ?? 0;
      if (load < teacher.limits.min || load > teacher.limits.max) {
        errors.push(`${teacher.name} has ${load} counted teaching periods; required ${teacher.limits.min}-${teacher.limits.max}.`);
      }
    }
  }
  return errors;
}

function createResult(status, errors, assumptions, extra = {}) {
  return {
    status,
    algorithm: "Bounded MRV constraint search for lesson placements and teacher/room assignments, followed by independent hard-constraint validation.",
    assumptions,
    errors,
    ...extra,
  };
}

export function generateTimetable({ records, options = {} }) {
  const normalized = normalizeInput(records, options);
  if (normalized.errors.length) return createResult("invalid_input", normalized.errors, normalized.assumptions);

  const { teachers, events, assumptions } = normalized;
  const { placements, error: placementError } = buildPlacements(events);
  if (placementError) return createResult("infeasible", [placementError], assumptions);

  const search = solvePlacements(events, placements, teachers, options);
  if (!search.assignments) {
    const status = search.searchLimitReached || search.resourceSearchLimitReached ? "search_limit" : search.placementAttempts ? "resource_assignment_failed" : "infeasible";
    const message = status === "infeasible"
      ? `No group timetable satisfies the period, lunch, continuity, and fixed-course constraints.${search.blockingEvent ? ` No placement remained for ${search.blockingEvent}.` : ""}${search.rejectionReasons.length ? ` Most common rejections: ${search.rejectionReasons.join("; ")}.` : ""}`
      : status === "resource_assignment_failed"
        ? `No teacher/room-compatible assignment was found after ${search.placementAttempts} group schedules.`
        : `Search limit reached after ${search.dailyPlanAttempts} daily layouts, ${search.visitedNodes} placement nodes, and ${search.placementAttempts} group schedules; this is not a proof of infeasibility.`;
    return createResult(status, [message], assumptions, {
      attempts: search.placementAttempts,
      visitedNodes: search.visitedNodes,
      dailyPlan: search.dailyPlan,
      groupValidationFailures: search.groupValidationFailures,
      firstGroupValidationErrors: search.firstGroupValidationErrors,
    });
  }

  const resources = search.assignments;
    const assignments = resources.map((resource) => {
      const event = events[resource.eventIndex];
      const periods = Array.from({ length: event.duration }, (_, index) => resource.start + index);
      return {
        eventId: event.id,
        courseCode: event.courseCode,
        courseName: event.courseName,
        academicYear: event.academicYear,
        groupIds: event.groupIds,
        courseType: event.courseType,
        category: event.category,
        duration: event.duration,
        day: DAYS[resource.day],
        dayIndex: resource.day,
        startPeriod: resource.start,
        endPeriod: resource.end,
        periods,
        teacherId: resource.teacher.id,
        teacherName: resource.teacher.name,
        roomId: resource.room.id,
        roomName: resource.room.name,
        sourceSheet: event.sourceSheet,
        sourceRow: event.sourceRow,
      };
    }).sort((left, right) => left.dayIndex - right.dayIndex || left.startPeriod - right.startPeriod || left.academicYear.localeCompare(right.academicYear) || left.courseCode.localeCompare(right.courseCode));

    const validationErrors = validateSchedule(events, assignments, teachers, options.enforceTeacherWorkload !== false);
    if (validationErrors.length) {
      return createResult("validation_failed", validationErrors, assumptions, { attempts: search.placementAttempts });
    }

  return createResult("feasible", [], assumptions, {
    attempts: search.placementAttempts,
    visitedNodes: search.visitedNodes,
    schedule: assignments,
    lessonCount: assignments.length,
    teacherLoads: Object.fromEntries(teachers.map((teacher) => [teacher.name, assignments
      .filter((assignment) => assignment.teacherId === teacher.id && assignment.category !== "general_education")
      .reduce((total, assignment) => total + assignment.duration, 0)])),
  });
}
