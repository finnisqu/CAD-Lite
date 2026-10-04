from pathlib import Path

path = Path('src/app/interaction/room-features.ts')
text = path.read_text()

replacements = [
    (
        "import { rotateVector } from '../../geometry';",
        """import {
  constrainPointToAxes,
  distanceBetween,
  normalizeViewportScale,
  pointAngleDegrees,
  rotateVector,
  screenDistanceToWorld,
  snapAngleToIncrement,
} from '../../geometry';""",
    ),
    (
        "  const tolerance = 8 / Math.max(0.001, Math.abs(layout.scale || 1));",
        "  const tolerance = screenDistanceToWorld(8, layout.scale);",
    ),
    (
        """function weakStraightPoint(
  start: { x: number; y: number },
  end: { x: number; y: number },
  shift: boolean,
): { x: number; y: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (shift) {
    return Math.abs(dx) >= Math.abs(dy)
      ? { x: end.x, y: start.y }
      : { x: start.x, y: end.y };
  }

  const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
  const horizontal = Math.min(angle, Math.abs(180 - angle));
  const vertical = Math.abs(90 - angle);
  if (horizontal <= 3) return { x: end.x, y: start.y };
  if (vertical <= 3) return { x: start.x, y: end.y };
  return end;
}

""",
        "",
    ),
    (
        "  const end = weakStraightPoint(start, snap.point, input.modifiers.shift);",
        "  const end = constrainPointToAxes(start, snap.point, input.modifiers.shift, 3).point;",
    ),
    (
        "  const rotation = normalizeDegrees(Math.atan2(dy, dx) * 180 / Math.PI);",
        "  const rotation = normalizeDegrees(pointAngleDegrees(start, end));",
    ),
    (
        "        Number(preview.length) < 2 / Math.max(0.001, Math.abs(layout.scale || 1))",
        "        Number(preview.length) < screenDistanceToWorld(2, layout.scale)",
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'expected exactly one match, got {count}: {old[:80]!r}')
    text = text.replace(old, new)

old_scale = "scale: Math.max(0.001, Math.abs(layout.scale || 1)),"
if text.count(old_scale) != 3:
    raise SystemExit(f'expected 3 session scale matches, got {text.count(old_scale)}')
text = text.replace(old_scale, "scale: normalizeViewportScale(layout.scale),")

old_start_angle = """startPointerAngle:
        Math.atan2(input.y - center.y, input.x - center.x) * 180 / Math.PI,"""
new_start_angle = """startPointerAngle: pointAngleDegrees(center, {
        x: input.x,
        y: input.y,
      }),"""
if text.count(old_start_angle) != 1:
    raise SystemExit('start angle pattern mismatch')
text = text.replace(old_start_angle, new_start_angle)

old_drag = """session.moved =
      Math.hypot(input.x - session.start.x, input.y - session.start.y) >
      2 / session.scale;"""
new_drag = """session.moved =
      distanceBetween(session.start, { x: input.x, y: input.y }) >
      screenDistanceToWorld(2, session.scale);"""
if text.count(old_drag) != 1:
    raise SystemExit('drag threshold pattern mismatch')
text = text.replace(old_drag, new_drag)

old_rotate = """const angle =
        Math.atan2(
          input.y - session.center.y,
          input.x - session.center.x,
        ) * 180 / Math.PI;
      let rotation =
        session.originalRotation + angle - session.startPointerAngle;
      if (input.modifiers.shift) {
        rotation = Math.round(rotation / 90) * 90;
      } else if (!input.modifiers.alt) {
        const cardinal = Math.round(rotation / 90) * 90;
        if (Math.abs(rotation - cardinal) <= 5) rotation = cardinal;
      }"""
new_rotate = """const angle = pointAngleDegrees(session.center, {
        x: input.x,
        y: input.y,
      });
      let rotation =
        session.originalRotation + angle - session.startPointerAngle;
      const cardinal = snapAngleToIncrement(rotation, 90);
      if (input.modifiers.shift) {
        rotation = cardinal;
      } else if (!input.modifiers.alt && Math.abs(rotation - cardinal) <= 5) {
        rotation = cardinal;
      }"""
if text.count(old_rotate) != 1:
    raise SystemExit('rotation pattern mismatch')
text = text.replace(old_rotate, new_rotate)

path.write_text(text)

test_path = Path('tests/room-feature-interactions.test.ts')
tests = test_path.read_text()
marker = "  it('cancels an edit without mutating persisted geometry', () => {"
inserted = """  it('soft-snaps rotation to a cardinal angle within five degrees', () => {
    const { store, interaction } = setup();
    const feature = store.getState().project.layouts[0]!.roomFeatures[0]!;
    const center = {
      x: feature.x + feature.length / 2,
      y: feature.y + feature.depth / 2,
    };

    interaction.beginRotate(feature.id, pointer(center.x + 20, center.y));
    const radians = 86 * Math.PI / 180;
    const end = pointer(
      center.x + Math.cos(radians) * 30,
      center.y + Math.sin(radians) * 30,
      {
        modifiers: {
          shift: false,
          alt: false,
          ctrl: false,
          meta: false,
        },
      },
    );
    interaction.pointerMove(end);
    interaction.pointerUp({ ...end, buttons: 0 });

    expect(store.getState().project.layouts[0]!.roomFeatures[0]?.rotation).toBe(90);
  });

"""
if tests.count(marker) != 1:
    raise SystemExit('room-feature test insertion marker mismatch')
tests = tests.replace(marker, inserted + marker)
test_path.write_text(tests)

doc = Path('docs/architecture/BATCH_76_ROOM_FEATURE_DIRECT_MANIPULATION_GEOMETRY.md')
doc.write_text("""# Batch 76 — Room Feature Direct-Manipulation Geometry

## Scope

Batch 76 completes the consumer migration identified in Batch 75 by moving room-feature manipulation onto the shared geometry and viewport numeric foundations without changing room-feature policy or command ownership.

## Consumer migrations

`src/app/interaction/room-features.ts` now reuses:

- `constrainPointToAxes()` for Shift-forced and 3-degree weak wall straightening;
- `screenDistanceToWorld()` for the existing 8 px object-snap tolerance and 2 px short-wall / drag thresholds;
- `normalizeViewportScale()` for edit-session scale normalization;
- `distanceBetween()` for pointer movement gating;
- `pointAngleDegrees()` for wall and direct-rotation pointer angles;
- `snapAngleToIncrement()` for the existing 90-degree cardinal rotation target.

## Preserved application policy

The application layer still owns the actual values and decisions:

- 8 px room-feature snap tolerance;
- 2 px edit drag threshold;
- 2 px short-wall fallback threshold;
- 3-degree weak wall straightening;
- Shift-forced cardinal rotation;
- 5-degree soft cardinal rotation snap;
- Alt bypass for soft rotation snapping;
- 0.25 inch minimum room-feature size;
- room-feature resize side semantics;
- piece/grid/room-feature snap-target selection;
- preview serialization, commands, transactions, persistence, and saved project schema.

No controller hierarchy or new session abstraction is introduced.

## Regression coverage

The existing room-feature tool/edit suites continue to cover placement, Shift constraints, move/resize/rotate commit behavior, cancellation, and SLAB gating. Batch 76 adds a direct regression for the 5-degree soft cardinal rotation snap so both forced and soft cardinal policies are locked at the consumer boundary.

## Validation

The full architecture quality gate must pass: typecheck, lint, complete Vitest suite, production build, and browser-ready artifact verification.

## Next seam

With the main piece, annotation, and room-feature direct-manipulation math now consuming shared geometry, Batch 77 should audit the remaining bridge/legacy compatibility and browser-owned geometry paths for dead or duplicate calculations before the broader cutover hardening phase.
""")
