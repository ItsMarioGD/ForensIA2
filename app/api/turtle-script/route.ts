// Ports controllers/TurtleController.php + lib/TurtleBuilder.php.
// Receives the simulation payload and returns a downloadable Python script
// that renders the same forensic scene locally using turtle. The server
// never executes it — it's a static text artifact the user runs themselves.

import { NextRequest } from "next/server";

const TURTLE_SCRIPT_TEMPLATE = `#!/usr/bin/env python3
"""
╔═════════════════════════════════════════════════════════╗
║         FORENSIA - Simulacion Forense 2D                ║
║         Generado automaticamente con IA + Turtle        ║
╚═════════════════════════════════════════════════════════╝

Infraestructura: __INFRAESTRUCTURA__
Dictamen Tecnico:
__DICTAMEN__

Uso: python forensia_simulacion.py
Requiere: Python 3.x estandar (turtle incluido)
"""

import turtle
import time
import math


# ──────────────────────────────────────────
#  Datos de la simulacion (generados por IA)
# ──────────────────────────────────────────
INFRAESTRUCTURA = "__INFRAESTRUCTURA__"
FRAMES = [
__FRAMES__
]

SCALE = 8
ANIM_DELAY = 0.05
INTERP_STEPS = 30

screen = turtle.Screen()
screen.title("FORENSIA - Simulacion Forense 2D")
screen.bgcolor("#0a0e1a")
screen.setup(width=900, height=700)
screen.tracer(0)


def draw_road_line(t, x1, y1, x2, y2, color="#444444", width=1, dash=False):
    t.penup()
    t.goto(x1, y1)
    t.pendown()
    t.color(color)
    t.width(width)
    if dash:
        dx, dy = x2 - x1, y2 - y1
        dist = math.sqrt(dx**2 + dy**2)
        steps = int(dist / 10)
        for i in range(steps):
            frac0 = i / steps
            frac1 = (i + 0.5) / steps
            t.penup()
            t.goto(x1 + dx * frac0, y1 + dy * frac0)
            t.pendown()
            t.goto(x1 + dx * frac1, y1 + dy * frac1)
        t.penup()
    else:
        t.goto(x2, y2)
    t.penup()


def draw_infrastructure(t):
    t.speed(0); t.penup()
    road_color = "#1c1c1c"; line_color = "#ffff00"; edge_color = "#ffffff"; road_w = 40
    if INFRAESTRUCTURA in ("interseccion_cruciforme", "interseccion"):
        t.goto(-300, -road_w); t.fillcolor(road_color); t.begin_fill()
        for dx, dy in [(600, 0), (0, road_w*2), (-600, 0), (0, -road_w*2)]:
            t.goto(t.xcor() + dx, t.ycor() + dy)
        t.end_fill()
        t.goto(-road_w, -300); t.begin_fill()
        for dx, dy in [(road_w*2, 0), (0, 600), (-road_w*2, 0), (0, -600)]:
            t.goto(t.xcor() + dx, t.ycor() + dy)
        t.end_fill()
        for y in [-road_w, road_w]:
            draw_road_line(t, -300, y, -road_w, y, edge_color, 2)
            draw_road_line(t, road_w, y, 300, y, edge_color, 2)
        for x in [-road_w, road_w]:
            draw_road_line(t, x, -300, x, -road_w, edge_color, 2)
            draw_road_line(t, x, road_w, x, 300, edge_color, 2)
        draw_road_line(t, -300, 0, -road_w, 0, line_color, 1, dash=True)
        draw_road_line(t, road_w, 0, 300, 0, line_color, 1, dash=True)
        draw_road_line(t, 0, -300, 0, -road_w, line_color, 1, dash=True)
        draw_road_line(t, 0, road_w, 0, 300, line_color, 1, dash=True)
    elif INFRAESTRUCTURA == "recta":
        t.goto(-400, -road_w); t.fillcolor(road_color); t.begin_fill()
        for dx, dy in [(800, 0), (0, road_w*2), (-800, 0), (0, -road_w*2)]:
            t.goto(t.xcor() + dx, t.ycor() + dy)
        t.end_fill()
        draw_road_line(t, -400, -road_w, 400, -road_w, edge_color, 2)
        draw_road_line(t, -400, road_w, 400, road_w, edge_color, 2)
        draw_road_line(t, -400, 0, 400, 0, line_color, 1, dash=True)


def draw_point_of_impact(t):
    t.penup(); t.goto(-10, -10); t.pendown(); t.color("#ff0000"); t.width(3); t.goto(10, 10); t.penup()
    t.goto(10, -10); t.pendown(); t.goto(-10, 10); t.penup()


def make_triangle(t, x, y, size, color):
    t.clear(); t.penup(); t.goto(x, y); t.setheading(90); t.pendown()
    t.fillcolor(color); t.color(color); t.begin_fill()
    for _ in range(3):
        t.forward(size); t.left(120)
    t.end_fill(); t.penup()


def lerp(a, b, frac):
    return a + (b - a) * frac


def lerp_angle(a, b, frac):
    diff = (b - a + 180) % 360 - 180
    return a + diff * frac


def draw_trajectory(t, frames_data, key_x, key_y, color):
    t.clear(); t.color(color); t.width(1); t.penup()
    first = True
    for f in frames_data:
        px = f[key_x] * SCALE; py = -f[key_y] * SCALE
        if first:
            t.goto(px, py); t.pendown(); first = False
        else:
            t.goto(px, py)
    t.penup()


def main():
    road_t = turtle.Turtle(); road_t.speed(0); road_t.hideturtle(); road_t.penup()
    impact_t = turtle.Turtle(); impact_t.speed(0); impact_t.hideturtle(); impact_t.penup()
    traj1_t = turtle.Turtle(); traj1_t.speed(0); traj1_t.hideturtle(); traj1_t.penup(); traj1_t.width(1)
    traj2_t = turtle.Turtle(); traj2_t.speed(0); traj2_t.hideturtle(); traj2_t.penup(); traj2_t.width(1)
    v1_t = turtle.Turtle(); v1_t.speed(0); v1_t.hideturtle()
    v2_t = turtle.Turtle(); v2_t.speed(0); v2_t.hideturtle()

    draw_infrastructure(road_t)
    draw_point_of_impact(impact_t)
    draw_trajectory(traj1_t, FRAMES, "v1_x", "v1_y", "#e74c3c55")
    draw_trajectory(traj2_t, FRAMES, "v2_x", "v2_y", "#3498db55")
    screen.update()
    time.sleep(0.5)

    total_frames = len(FRAMES)
    for i in range(total_frames - 1):
        f0 = FRAMES[i]; f1 = FRAMES[i + 1]
        for step in range(INTERP_STEPS + 1):
            frac = step / INTERP_STEPS
            v1x = lerp(f0["v1_x"], f1["v1_x"], frac)
            v1y = lerp(f0["v1_y"], f1["v1_y"], frac)
            v2x = lerp(f0["v2_x"], f1["v2_x"], frac)
            v2y = lerp(f0["v2_y"], f1["v2_y"], frac)
            make_triangle(v1_t, v1x * SCALE, -v1y * SCALE, 30, "#e74c3c")
            make_triangle(v2_t, v2x * SCALE, -v2y * SCALE, 30, "#2980b9")
            screen.update()
            time.sleep(ANIM_DELAY)

    turtle.done()


if __name__ == "__main__":
    main()
`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.animacion_actores) {
    return new Response("# ERROR: body inválido. Se esperaba el JSON de la simulación.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const infra = String(body.infraestructura ?? "interseccion_cruciforme");
  const dictamen = String(body.dictamen_tecnico ?? "");
  const frames: any[] = body.animacion_actores;

  const framesCode = frames
    .map(
      (f) =>
        `    {'t': ${Number(f.segundo)}, 'v1_x': ${Number(f.v1_x)}, 'v1_y': ${Number(f.v1_y)}, 'v1_a': ${Number(f.v1_angulo)}, 'v2_x': ${Number(f.v2_x)}, 'v2_y': ${Number(f.v2_y)}, 'v2_a': ${Number(f.v2_angulo)}},`
    )
    .join("\n");

  const script = TURTLE_SCRIPT_TEMPLATE.replace(/__INFRAESTRUCTURA__/g, infra.replace(/"/g, '\\"'))
    .replace(/__DICTAMEN__/g, dictamen.replace(/"/g, '\\"'))
    .replace(/__FRAMES__/g, framesCode);

  return new Response(script, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="forensia_simulacion.py"',
    },
  });
}
