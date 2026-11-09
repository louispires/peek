// Builders for the JSON Frigate publishes on `frigate/events`.

const DEFAULT_BOX = [128, 72, 640, 360]

function state(id, camera, label, score, extra) {
  return Object.assign({
    id,
    camera,
    label,
    score,
    top_score: score,
    box: DEFAULT_BOX,
    stationary: false,
    current_zones: [],
    entered_zones: [],
    sub_label: null,
    recognized_license_plate: null
  }, extra)
}

function event(type, id, camera, label, score, extra) {
  const after = state(id, camera, label, score, extra)
  return { type, before: Object.assign({}, after), after }
}

function newEvent(id, camera, label = 'person', score = 0.81, extra) {
  return event('new', id, camera, label, score, extra)
}

function updateEvent(id, camera, label = 'person', score = 0.81, extra) {
  return event('update', id, camera, label, score, extra)
}

function endEvent(id, camera, label = 'person', score = 0.81, extra) {
  return event('end', id, camera, label, score, extra)
}

module.exports = { newEvent, updateEvent, endEvent, DEFAULT_BOX }
