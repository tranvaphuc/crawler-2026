// Calendar boundaries use Vietnam time, including midnight at the start of the month.
export function monthBounds(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid --month (YYYY-MM)');
  const [year, number] = month.split('-').map(Number);
  return { start: Date.UTC(year, number - 1, 1, -7) / 1000,
    end: Date.UTC(year, number, 1, -7) / 1000 };
}

export function selectMonthStories(stories, bounds) {
  const selected = [];
  let cutoff = false, missingTime = 0;
  for (const story of stories) {
    if (!story?.post_id) continue;
    const time = story.creation_time;
    if (typeof time !== 'number' || !Number.isFinite(time)) { missingTime++; continue; }
    if (time < bounds.start) { cutoff = true; break; }
    if (time < bounds.end) selected.push(story);
  }
  return { selected, cutoff, missingTime };
}

export function owningProfileType(story) {
  // Do not substitute Story.__typename or infer anonymity from a missing field.
  return story.feedback?.owning_profile?.__typename ?? '';
}
