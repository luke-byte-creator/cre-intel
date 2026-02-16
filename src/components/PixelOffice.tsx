"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ── Agent definitions ── */
const AGENTS = [
  { id: "nova", name: "Nova", role: "The Boss", color: "#F1C40F", deskItem: "star", isBoss: true },
  { id: "atlas", name: "Atlas", role: "Document Architect", color: "#4A90D9", deskItem: "globe", isBoss: false },
  { id: "sage", name: "Sage", role: "Trade Record Keeper", color: "#9B59B6", deskItem: "books", isBoss: false },
  { id: "pixl", name: "PIXL", role: "Chief Importer", color: "#2ECC71", deskItem: "coffee", isBoss: false },
  { id: "iris", name: "Iris", role: "Intel Director", color: "#E91E8C", deskItem: "palette", isBoss: false },
  { id: "echo", name: "Echo", role: "Office Secretary", color: "#00BCD4", deskItem: "waveform", isBoss: false },
  { id: "scout", name: "Scout", role: "Watchlist Sentinel", color: "#E67E22", deskItem: "fire", isBoss: false },
] as const;

const W = 1100;
const H = 480;
const TILE = 20;

/* ── Cubicle positions (4x2 grid) ── */
const CUBICLE_W = 120;
const CUBICLE_H = 110;
const CUBICLE_GAP = 20;
const CUBICLE_START_X = 40;
const CUBICLE_START_Y = 215;

function getCubiclePos(index: number) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  const x = CUBICLE_START_X + col * (CUBICLE_W + CUBICLE_GAP);
  const y = CUBICLE_START_Y + row * (CUBICLE_H + CUBICLE_GAP);
  return { x, y };
}

function getDeskSeatPos(index: number) {
  // Nova (index 0) sits behind the executive desk, facing the door
  if (index === 0) return { x: 442, y: 55 };
  // Other agents use cubicles (offset by -1 since Nova takes boss office)
  const { x, y } = getCubiclePos(index - 1);
  return { x: x + 50, y: y + 60 };
}

/* ── Waypoints for idle wandering ── */
const WAYPOINTS = [
  { x: 150, y: 120 },  // conference room
  { x: 400, y: 120 },  // boss office
  { x: 650, y: 120 },  // kitchen
  { x: 900, y: 300 },  // lounge
  { x: 900, y: 420 },  // lounge lower
  { x: 300, y: 350 },  // corridor
  { x: 500, y: 350 },  // corridor
  { x: 200, y: 460 },  // lower corridor
  { x: 400, y: 460 },  // lower corridor
  { x: 700, y: 300 },  // right corridor
];

/* ── Agent state ── */
interface AgentState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  status: "working" | "idle";
  facingRight: boolean;
  atDesk: boolean;
  waitTimer: number;
  frame: number;
}

/* ── Steam particle ── */
interface Particle {
  x: number;
  y: number;
  life: number;
  vy: number;
}

interface LeaderboardEntry {
  userId: number;
  name: string;
  earned: number;
}

export default function PixelOffice({ leaderboard = [] }: { leaderboard?: LeaderboardEntry[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statesRef = useRef<AgentState[]>([]);
  const statusesRef = useRef<Record<string, "working" | "idle">>({});
  const frameCountRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const speechBubbleRef = useRef<{ text: string; timer: number } | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [agentStatuses, setAgentStatuses] = useState<{ id: string; name: string; role: string; status: string }[]>(
    AGENTS.map(a => ({ id: a.id, name: a.name, role: a.role, status: "working" }))
  );

  const submitFeedback = useCallback(async () => {
    if (!feedbackText.trim() || feedbackSending) return;
    setFeedbackSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: feedbackText.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        speechBubbleRef.current = { text: data.novaReply || "Got it! 🫡", timer: 300 };
        setFeedbackText("");
        setFeedbackSent(true);
        setTimeout(() => setFeedbackSent(false), 3000);
      }
    } catch { /* ignore */ }
    setFeedbackSending(false);
  }, [feedbackText, feedbackSending]);

  // Initialize agent states
  useEffect(() => {
    statesRef.current = AGENTS.map((_, i) => {
      const seat = getDeskSeatPos(i);
      return {
        x: seat.x,
        y: seat.y,
        targetX: seat.x,
        targetY: seat.y,
        status: "working" as const,
        facingRight: true,
        atDesk: true,
        waitTimer: 0,
        frame: 0,
      };
    });
  }, []);

  // Poll status
  useEffect(() => {
    const poll = () => {
      fetch("/api/employee-status")
        .then(r => r.json())
        .then(d => {
          const map: Record<string, "working" | "idle"> = {};
          for (const a of d.agents) map[a.id] = a.status;
          statusesRef.current = map;
          setAgentStatuses(d.agents);
        })
        .catch(() => {});
    };
    poll();
    const iv = setInterval(poll, 30 * 60 * 1000); // 30 minutes
    return () => clearInterval(iv);
  }, []);

  /* ── Drawing helpers ── */
  const drawFloor = useCallback((ctx: CanvasRenderingContext2D) => {
    for (let ty = 0; ty < H; ty += TILE) {
      for (let tx = 0; tx < W; tx += TILE) {
        ctx.fillStyle = ((tx / TILE + ty / TILE) % 2 === 0) ? "#1a1a2e" : "#16162a";
        ctx.fillRect(tx, ty, TILE, TILE);
      }
    }
  }, []);

  const drawWall = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = "#2a2a3e";
    ctx.fillRect(x, y, w, h);
  }, []);

  const drawConferenceRoom = useCallback((ctx: CanvasRenderingContext2D) => {
    // Walls
    drawWall(ctx, 10, 10, 300, 3);
    drawWall(ctx, 10, 10, 3, 190);
    drawWall(ctx, 10, 197, 300, 3);
    drawWall(ctx, 307, 10, 3, 190);

    // Round table (ellipse approximation with rects)
    ctx.fillStyle = "#5D4037";
    ctx.fillRect(120, 80, 80, 60);
    ctx.fillRect(115, 85, 90, 50);

    // Chairs around table
    const chairPositions = [
      [140, 65], [180, 65], [140, 145], [180, 145],
      [105, 95], [105, 120], [210, 95], [210, 120],
    ];
    for (const [cx, cy] of chairPositions) {
      ctx.fillStyle = "#37474F";
      ctx.fillRect(cx, cy, 16, 16);
      ctx.fillStyle = "#455A64";
      ctx.fillRect(cx + 2, cy + 2, 12, 12);
    }

    // Whiteboard on wall
    ctx.fillStyle = "#ECEFF1";
    ctx.fillRect(130, 18, 70, 35);
    ctx.fillStyle = "#B0BEC5";
    ctx.fillRect(128, 16, 74, 3);
    // Squiggly lines on whiteboard
    ctx.fillStyle = "#90A4AE";
    ctx.fillRect(138, 28, 40, 2);
    ctx.fillRect(138, 34, 30, 2);
    ctx.fillRect(138, 40, 45, 2);
  }, [drawWall]);

  const drawBossOffice = useCallback((ctx: CanvasRenderingContext2D) => {
    const ox = 320;
    drawWall(ctx, ox, 10, 250, 3);
    drawWall(ctx, ox, 10, 3, 190);
    drawWall(ctx, ox, 197, 250, 3);
    drawWall(ctx, ox + 247, 10, 3, 190);

    // Executive desk
    ctx.fillStyle = "#4E342E";
    ctx.fillRect(ox + 80, 70, 90, 40);
    ctx.fillStyle = "#3E2723";
    ctx.fillRect(ox + 85, 75, 80, 30);

    // Chair behind desk (above desk, facing door)
    ctx.fillStyle = "#263238";
    ctx.fillRect(ox + 110, 38, 24, 24);
    ctx.fillStyle = "#37474F";
    ctx.fillRect(ox + 112, 40, 20, 20);

    // "NOVA" nameplate
    ctx.fillStyle = "#F1C40F";
    ctx.fillRect(ox + 95, 62, 60, 14);
    ctx.fillStyle = "#0f0f1a";
    ctx.font = "bold 12px monospace";
    ctx.fillText("NOVA", ox + 110, 72);

    // Leather couch
    ctx.fillStyle = "#3E2723";
    ctx.fillRect(ox + 20, 140, 60, 25);
    ctx.fillStyle = "#4E342E";
    ctx.fillRect(ox + 22, 142, 56, 21);
    ctx.fillRect(ox + 18, 138, 8, 30);
    ctx.fillRect(ox + 74, 138, 8, 30);

    // Bookshelf
    ctx.fillStyle = "#5D4037";
    ctx.fillRect(ox + 170, 20, 50, 70);
    const bookColors = ["#E74C3C", "#3498DB", "#2ECC71", "#F1C40F", "#9B59B6", "#E67E22"];
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = bookColors[i];
      ctx.fillRect(ox + 174 + (i % 3) * 14, 25 + Math.floor(i / 3) * 30, 10, 24);
    }

    // Plant
    ctx.fillStyle = "#795548";
    ctx.fillRect(ox + 180, 150, 16, 20);
    ctx.fillStyle = "#4CAF50";
    ctx.fillRect(ox + 175, 135, 26, 18);
    ctx.fillStyle = "#66BB6A";
    ctx.fillRect(ox + 180, 128, 16, 12);
  }, [drawWall]);

  const drawKitchen = useCallback((ctx: CanvasRenderingContext2D) => {
    const kx = 580;
    drawWall(ctx, kx, 10, 250, 3);
    drawWall(ctx, kx, 10, 3, 190);
    drawWall(ctx, kx, 197, 250, 3);
    drawWall(ctx, kx + 247, 10, 3, 190);

    // Cabinets (white)
    ctx.fillStyle = "#ECEFF1";
    ctx.fillRect(kx + 15, 18, 120, 30);
    ctx.fillStyle = "#CFD8DC";
    ctx.fillRect(kx + 20, 20, 35, 26);
    ctx.fillRect(kx + 60, 20, 35, 26);
    ctx.fillRect(kx + 100, 20, 30, 26);

    // Counter
    ctx.fillStyle = "#78909C";
    ctx.fillRect(kx + 15, 50, 120, 8);

    // Fridge
    ctx.fillStyle = "#78909C";
    ctx.fillRect(kx + 170, 18, 45, 80);
    ctx.fillStyle = "#90A4AE";
    ctx.fillRect(kx + 173, 20, 39, 35);
    ctx.fillRect(kx + 173, 58, 39, 35);
    ctx.fillStyle = "#B0BEC5";
    ctx.fillRect(kx + 215, 35, 3, 10);
    ctx.fillRect(kx + 215, 70, 3, 10);

    // Coffee machine
    ctx.fillStyle = "#5D4037";
    ctx.fillRect(kx + 50, 60, 25, 30);
    ctx.fillStyle = "#4E342E";
    ctx.fillRect(kx + 48, 58, 29, 5);
    ctx.fillStyle = "#F44336";
    ctx.fillRect(kx + 70, 68, 3, 3);

    // Small table
    ctx.fillStyle = "#5D4037";
    ctx.fillRect(kx + 80, 130, 60, 40);
    ctx.fillStyle = "#6D4C41";
    ctx.fillRect(kx + 82, 132, 56, 36);

    // Fruit bowl
    ctx.fillStyle = "#795548";
    ctx.fillRect(kx + 98, 135, 20, 8);
    ctx.fillStyle = "#F44336";
    ctx.fillRect(kx + 100, 131, 6, 6);
    ctx.fillStyle = "#FFEB3B";
    ctx.fillRect(kx + 108, 131, 6, 6);
    ctx.fillStyle = "#4CAF50";
    ctx.fillRect(kx + 104, 128, 6, 5);
  }, [drawWall]);

  const drawDeskItem = useCallback((ctx: CanvasRenderingContext2D, item: string, x: number, y: number) => {
    switch (item) {
      case "globe":
        ctx.fillStyle = "#2196F3";
        ctx.fillRect(x, y, 10, 10);
        ctx.fillStyle = "#4CAF50";
        ctx.fillRect(x + 2, y + 3, 6, 4);
        ctx.fillStyle = "#795548";
        ctx.fillRect(x + 3, y + 10, 4, 4);
        break;
      case "books":
        ctx.fillStyle = "#E74C3C";
        ctx.fillRect(x, y + 2, 4, 12);
        ctx.fillStyle = "#3498DB";
        ctx.fillRect(x + 5, y + 4, 4, 10);
        ctx.fillStyle = "#4CAF50";
        ctx.fillRect(x + 10, y + 1, 4, 13);
        break;
      case "coffee":
        ctx.fillStyle = "#ECEFF1";
        ctx.fillRect(x, y + 4, 10, 10);
        ctx.fillStyle = "#795548";
        ctx.fillRect(x + 2, y + 6, 6, 6);
        ctx.fillStyle = "#ECEFF1";
        ctx.fillRect(x + 10, y + 6, 3, 6);
        break;
      case "star":
        ctx.fillStyle = "#F1C40F";
        ctx.fillRect(x + 4, y, 4, 4);
        ctx.fillRect(x, y + 4, 12, 4);
        ctx.fillRect(x + 2, y + 8, 8, 4);
        ctx.fillRect(x + 4, y + 12, 4, 2);
        break;
      case "palette":
        ctx.fillStyle = "#8D6E63";
        ctx.fillRect(x, y + 2, 14, 10);
        ctx.fillStyle = "#F44336";
        ctx.fillRect(x + 2, y + 4, 3, 3);
        ctx.fillStyle = "#2196F3";
        ctx.fillRect(x + 6, y + 4, 3, 3);
        ctx.fillStyle = "#FFEB3B";
        ctx.fillRect(x + 10, y + 4, 3, 3);
        break;
      case "waveform":
        ctx.fillStyle = "#00BCD4";
        const heights = [4, 8, 12, 6, 10, 4, 8];
        heights.forEach((h, i) => {
          ctx.fillRect(x + i * 2, y + 14 - h, 1, h);
        });
        break;
      case "shield":
        ctx.fillStyle = "#E74C3C";
        ctx.fillRect(x + 2, y, 8, 4);
        ctx.fillRect(x, y + 4, 12, 6);
        ctx.fillRect(x + 2, y + 10, 8, 2);
        ctx.fillRect(x + 4, y + 12, 4, 2);
        break;
      case "fire":
        ctx.fillStyle = "#E67E22";
        ctx.fillRect(x + 4, y, 4, 4);
        ctx.fillRect(x + 2, y + 4, 8, 4);
        ctx.fillStyle = "#F44336";
        ctx.fillRect(x, y + 8, 12, 4);
        ctx.fillStyle = "#FFEB3B";
        ctx.fillRect(x + 4, y + 4, 4, 4);
        break;
    }
  }, []);

  const drawCubicles = useCallback((ctx: CanvasRenderingContext2D) => {
    // Skip Nova (index 0) — sits in boss office
    for (let i = 1; i < AGENTS.length; i++) {
      const { x, y } = getCubiclePos(i - 1);
      const agent = AGENTS[i];

      // Partition walls
      ctx.fillStyle = "#2a2a3e";
      ctx.fillRect(x, y, CUBICLE_W, 3);
      ctx.fillRect(x, y, 3, CUBICLE_H);
      ctx.fillRect(x + CUBICLE_W - 3, y, 3, CUBICLE_H);
      ctx.fillRect(x, y + CUBICLE_H - 3, CUBICLE_W, 3);

      // Desk
      ctx.fillStyle = "#6D4C41";
      ctx.fillRect(x + 20, y + 15, 80, 35);
      ctx.fillStyle = "#5D4037";
      ctx.fillRect(x + 22, y + 17, 76, 31);

      // Monitor
      const fc = frameCountRef.current;
      const flicker = Math.sin(fc * 0.05 + i * 2) * 15;
      ctx.fillStyle = "#263238";
      ctx.fillRect(x + 42, y + 12, 36, 28);
      ctx.fillStyle = `rgb(${40 + flicker}, ${80 + flicker}, ${180 + flicker})`;
      ctx.fillRect(x + 44, y + 14, 32, 22);
      // Monitor stand
      ctx.fillStyle = "#263238";
      ctx.fillRect(x + 55, y + 40, 10, 5);
      ctx.fillRect(x + 50, y + 44, 20, 3);

      // Status light on monitor
      const blink = Math.sin(fc * 0.1 + i) > 0.5;
      ctx.fillStyle = blink ? "#4CAF50" : "#1B5E20";
      ctx.fillRect(x + 44, y + 38, 3, 3);

      // Chair
      ctx.fillStyle = "#37474F";
      ctx.fillRect(x + 48, y + 55, 24, 20);
      ctx.fillStyle = "#455A64";
      ctx.fillRect(x + 50, y + 57, 20, 16);

      // Desk item
      drawDeskItem(ctx, agent.deskItem, x + 25, y + 20);

      // Name plate
      ctx.fillStyle = agent.color;
      ctx.font = "bold 16px monospace";
      ctx.fillText(agent.name, x + 20, y + CUBICLE_H - 5);
    }
  }, [drawDeskItem]);

  const drawLounge = useCallback((ctx: CanvasRenderingContext2D) => {
    const lx = 850;
    const ly = 220;

    // Border
    drawWall(ctx, lx - 5, ly, 3, 260);

    // Couch
    ctx.fillStyle = "#37474F";
    ctx.fillRect(lx + 20, ly + 20, 80, 35);
    ctx.fillStyle = "#455A64";
    ctx.fillRect(lx + 22, ly + 22, 76, 31);
    ctx.fillRect(lx + 16, ly + 18, 10, 40);
    ctx.fillRect(lx + 96, ly + 18, 10, 40);

    // Coffee table
    ctx.fillStyle = "#5D4037";
    ctx.fillRect(lx + 35, ly + 65, 50, 25);

    // Water cooler
    ctx.fillStyle = "#ECEFF1";
    ctx.fillRect(lx + 160, ly + 10, 20, 45);
    ctx.fillStyle = "#42A5F5";
    ctx.fillRect(lx + 162, ly + 12, 16, 20);
    ctx.fillStyle = "#E0E0E0";
    ctx.fillRect(lx + 165, ly + 45, 10, 8);

    // Bean bags
    ctx.fillStyle = "#E91E8C";
    ctx.fillRect(lx + 20, ly + 105, 25, 20);
    ctx.fillStyle = "#2ECC71";
    ctx.fillRect(lx + 55, ly + 108, 25, 20);
    ctx.fillStyle = "#F1C40F";
    ctx.fillRect(lx + 90, ly + 103, 25, 20);

    // Ping pong table
    ctx.fillStyle = "#2E7D32";
    ctx.fillRect(lx + 20, ly + 150, 90, 55);
    ctx.fillStyle = "#1B5E20";
    ctx.fillRect(lx + 63, ly + 150, 3, 55);
    // Net
    ctx.fillStyle = "#ECEFF1";
    ctx.fillRect(lx + 62, ly + 148, 5, 3);

    // Small whiteboard
    ctx.fillStyle = "#ECEFF1";
    ctx.fillRect(lx + 140, ly + 100, 55, 40);
    ctx.fillStyle = "#B0BEC5";
    ctx.fillRect(lx + 138, ly + 98, 59, 3);
    ctx.fillStyle = "#E74C3C";
    ctx.fillRect(lx + 148, ly + 110, 20, 2);
    ctx.fillStyle = "#2196F3";
    ctx.fillRect(lx + 148, ly + 116, 30, 2);
    ctx.fillStyle = "#4CAF50";
    ctx.fillRect(lx + 148, ly + 122, 15, 2);

    // Vending machine
    ctx.fillStyle = "#37474F";
    ctx.fillRect(lx + 150, ly + 160, 40, 60);
    ctx.fillStyle = "#263238";
    ctx.fillRect(lx + 155, ly + 165, 30, 35);
    ctx.fillStyle = "#F44336";
    ctx.fillRect(lx + 160, ly + 170, 8, 6);
    ctx.fillStyle = "#2196F3";
    ctx.fillRect(lx + 172, ly + 170, 8, 6);
    ctx.fillStyle = "#4CAF50";
    ctx.fillRect(lx + 160, ly + 180, 8, 6);
    ctx.fillStyle = "#FFEB3B";
    ctx.fillRect(lx + 172, ly + 180, 8, 6);
    ctx.fillStyle = "#E0E0E0";
    ctx.fillRect(lx + 160, ly + 205, 20, 8);
  }, [drawWall]);

  const drawDecorations = useCallback((ctx: CanvasRenderingContext2D) => {
    // Potted plants scattered
    const plantPositions = [
      [15, 210], [310, 210], [570, 210], [835, 210],
      [600, 460], [835, 460],
    ];
    for (const [px, py] of plantPositions) {
      ctx.fillStyle = "#795548";
      ctx.fillRect(px, py + 10, 14, 12);
      ctx.fillStyle = "#4CAF50";
      ctx.fillRect(px - 2, py, 18, 14);
      ctx.fillStyle = "#66BB6A";
      ctx.fillRect(px + 2, py - 6, 10, 10);
    }
  }, []);

  const drawCharacter = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, color: string, facingRight: boolean, frame: number, atDesk: boolean, isBoss = false) => {
    const s = 2; // scale

    // Crown for the boss
    if (isBoss) {
      const crownY = atDesk ? y - 13 * s : y - 13 * s;
      ctx.fillStyle = "#F1C40F";
      // Crown base
      ctx.fillRect(x - 5 * s, crownY, 10 * s, 2 * s);
      // Crown points
      ctx.fillRect(x - 5 * s, crownY - 3 * s, 2 * s, 3 * s);
      ctx.fillRect(x - 1 * s, crownY - 4 * s, 2 * s, 4 * s);
      ctx.fillRect(x + 3 * s, crownY - 3 * s, 2 * s, 3 * s);
      // Gems
      ctx.fillStyle = "#E74C3C";
      ctx.fillRect(x - 4 * s, crownY - 2 * s, 1 * s, 1 * s);
      ctx.fillStyle = "#3498DB";
      ctx.fillRect(x, crownY - 3 * s, 1 * s, 1 * s);
      ctx.fillStyle = "#E74C3C";
      ctx.fillRect(x + 4 * s, crownY - 2 * s, 1 * s, 1 * s);

      // Golden glow around character
      const glowAlpha = 0.08 + Math.sin(frameCountRef.current * 0.03) * 0.04;
      ctx.fillStyle = `rgba(241, 196, 15, ${glowAlpha})`;
      ctx.fillRect(x - 8 * s, y - 12 * s, 16 * s, 28 * s);
    }

    if (atDesk) {
      // Sitting: draw facing monitor (forward)
      const typingOffset = frame === 0 ? 0 : 1;
      // Hair
      ctx.fillStyle = color;
      ctx.fillRect(x - 5 * s, y - 10 * s, 10 * s, 3 * s);
      // Head
      ctx.fillStyle = "#FFDBAC";
      ctx.fillRect(x - 4 * s, y - 7 * s, 8 * s, 6 * s);
      // Eyes
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(x - 2 * s, y - 5 * s, 2 * s, 2 * s);
      ctx.fillRect(x + 2 * s, y - 5 * s, 2 * s, 2 * s);
      // Shirt
      ctx.fillStyle = color;
      ctx.fillRect(x - 4 * s, y - 1 * s, 8 * s, 8 * s);
      // Arms forward (typing)
      ctx.fillRect(x - 6 * s, y + (0 + typingOffset) * s, 2 * s, 6 * s);
      ctx.fillRect(x + 4 * s, y + (0 + typingOffset) * s, 2 * s, 6 * s);
      return;
    }

    // Standing/Walking
    const armOff1 = frame === 0 ? -2 : 2;
    const armOff2 = frame === 0 ? 2 : -2;
    const legOff1 = frame === 0 ? -1 : 1;
    const legOff2 = frame === 0 ? 1 : -1;

    // Hair
    ctx.fillStyle = color;
    ctx.fillRect(x - 5 * s, y - 10 * s, 10 * s, 3 * s);
    // Head
    ctx.fillStyle = "#FFDBAC";
    ctx.fillRect(x - 4 * s, y - 7 * s, 8 * s, 6 * s);
    // Eyes (face direction)
    ctx.fillStyle = "#1a1a2e";
    if (facingRight) {
      ctx.fillRect(x + 0 * s, y - 5 * s, 2 * s, 2 * s);
      ctx.fillRect(x + 3 * s, y - 5 * s, 2 * s, 2 * s);
    } else {
      ctx.fillRect(x - 4 * s, y - 5 * s, 2 * s, 2 * s);
      ctx.fillRect(x - 1 * s, y - 5 * s, 2 * s, 2 * s);
    }
    // Shirt
    ctx.fillStyle = color;
    ctx.fillRect(x - 4 * s, y - 1 * s, 8 * s, 8 * s);
    // Arms
    ctx.fillRect(x - 6 * s, y + armOff1 * s, 2 * s, 6 * s);
    ctx.fillRect(x + 4 * s, y + armOff2 * s, 2 * s, 6 * s);
    // Pants
    ctx.fillStyle = "#2a2a3e";
    ctx.fillRect(x - 4 * s, y + 7 * s, 8 * s, 6 * s);
    // Legs
    ctx.fillRect(x - 4 * s, y + (13 + legOff1) * s, 3 * s, 4 * s);
    ctx.fillRect(x + 1 * s, y + (13 + legOff2) * s, 3 * s, 4 * s);
  }, []);

  const drawSteamParticles = useCallback((ctx: CanvasRenderingContext2D) => {
    const particles = particlesRef.current;
    // Spawn new particles near coffee machine
    if (Math.random() < 0.1) {
      particles.push({ x: 632 + Math.random() * 10, y: 58, life: 30 + Math.random() * 20, vy: -0.5 });
    }
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.y += p.vy;
      p.x += (Math.random() - 0.5) * 0.5;
      p.life--;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = p.life / 50;
      ctx.fillRect(p.x, p.y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }, []);

  /* ── Main animation loop ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let lastFrameToggle = 0;

    const update = (time: number) => {
      frameCountRef.current++;
      const fc = frameCountRef.current;

      // Toggle animation frame every 300ms
      const frameToggle = Math.floor(time / 300) !== lastFrameToggle;
      if (frameToggle) lastFrameToggle = Math.floor(time / 300);

      const states = statesRef.current;
      const statuses = statusesRef.current;

      // Update agent logic
      for (let i = 0; i < states.length; i++) {
        const s = states[i];
        const agent = AGENTS[i];
        const newStatus = statuses[agent.id] || "working";

        if (newStatus !== s.status) {
          s.status = newStatus;
          if (newStatus === "working") {
            const seat = getDeskSeatPos(i);
            s.targetX = seat.x;
            s.targetY = seat.y;
            s.atDesk = false;
          } else {
            s.atDesk = false;
            const wp = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
            s.targetX = wp.x;
            s.targetY = wp.y;
          }
          s.waitTimer = 0;
        }

        // Movement
        const dx = s.targetX - s.x;
        const dy = s.targetY - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 2) {
          s.atDesk = false;
          const speed = 1.5;
          s.x += (dx / dist) * speed;
          s.y += (dy / dist) * speed;
          s.facingRight = dx > 0;
          if (frameToggle) s.frame = (s.frame + 1) % 2;
        } else {
          if (s.status === "working") {
            s.atDesk = true;
            if (frameToggle) s.frame = (s.frame + 1) % 2;
          } else {
            // Idle: wait then pick new waypoint
            s.waitTimer++;
            if (s.waitTimer > 600 + Math.random() * 300) { // ~10-15 seconds
              s.waitTimer = 0;
              const wp = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
              s.targetX = wp.x + (Math.random() - 0.5) * 30;
              s.targetY = wp.y + (Math.random() - 0.5) * 20;
            }
          }
        }
      }

      // Draw
      ctx.clearRect(0, 0, W, H);
      drawFloor(ctx);
      drawConferenceRoom(ctx);
      drawBossOffice(ctx);
      drawKitchen(ctx);
      drawCubicles(ctx);
      drawLounge(ctx);
      drawDecorations(ctx);
      drawSteamParticles(ctx);

      // Draw characters
      for (let i = 0; i < states.length; i++) {
        const s = states[i];
        drawCharacter(ctx, s.x, s.y, AGENTS[i].color, s.facingRight, s.frame, s.atDesk, AGENTS[i].isBoss);
      }

      // Speech bubble on Nova (index 0)
      const bubble = speechBubbleRef.current;
      if (bubble && bubble.timer > 0) {
        bubble.timer--;
        if (bubble.timer <= 0) {
          speechBubbleRef.current = null;
        } else {
          const novaState = states[0];
          if (novaState) {
            const bx = novaState.x + 15;
            const by = novaState.y - 35;
            const text = bubble.text;
            ctx.font = "bold 16px monospace";
            const tw = Math.min(ctx.measureText(text).width + 24, 400);
            // Wrap text
            const maxW = 370;
            const words = text.split(" ");
            const lines: string[] = [];
            let line = "";
            for (const w of words) {
              const test = line ? line + " " + w : w;
              if (ctx.measureText(test).width > maxW) {
                if (line) lines.push(line);
                line = w;
              } else {
                line = test;
              }
            }
            if (line) lines.push(line);

            const lineH = 22;
            const padX = 14;
            const padY = 12;
            const bubbleW = Math.min(tw, maxW + padX * 2);
            const bubbleH = lines.length * lineH + padY * 2;
            const finalX = Math.max(5, Math.min(bx, W - bubbleW - 5));
            const finalY = Math.max(5, by - bubbleH);

            // Fade in/out
            const alpha = bubble.timer < 30 ? bubble.timer / 30 : bubble.timer > 270 ? (300 - bubble.timer) / 30 : 1;
            ctx.globalAlpha = alpha;

            // Bubble background — white with dark border
            ctx.fillStyle = "#1a1a2e";
            ctx.fillRect(finalX - 2, finalY - 2, bubbleW + 4, bubbleH + 4);
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(finalX, finalY, bubbleW, bubbleH);
            // Pointer
            ctx.fillStyle = "#1a1a2e";
            ctx.fillRect(finalX + 14, finalY + bubbleH, 18, 12);
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(finalX + 16, finalY + bubbleH, 14, 10);

            // Text — black on white
            ctx.fillStyle = "#111111";
            for (let li = 0; li < lines.length; li++) {
              ctx.fillText(lines[li], finalX + padX, finalY + padY + 14 + li * lineH);
            }
            ctx.globalAlpha = 1;
          }
        }
      }

      animId = requestAnimationFrame(update);
    };

    animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, [drawFloor, drawConferenceRoom, drawBossOffice, drawKitchen, drawCubicles, drawLounge, drawDecorations, drawSteamParticles, drawCharacter]);

  return (
    <div className="w-full">
      <div className="relative w-full overflow-hidden rounded-xl border border-white/5"
        style={{ maxWidth: W }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ width: "100%", height: "auto", display: "block", background: "#0f0f1a", imageRendering: "pixelated" }}
        />
      </div>
      {/* Status bar + Mini leaderboard */}
      <div className="flex gap-4 mt-3 items-end" style={{ maxWidth: W }}>
        {/* Left column: agent statuses + talk to the boss */}
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex flex-wrap gap-x-1.5 gap-y-1 items-start content-start">
            {agentStatuses.map(a => {
              const agent = AGENTS.find(ag => ag.id === a.id);
              const color = agent?.color || "#888";
              const isBoss = agent?.isBoss;
              return (
                <div key={a.id} className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${isBoss ? "bg-amber-500/10 ring-1 ring-amber-500/30 shadow-[0_0_8px_rgba(241,196,15,0.2)]" : "bg-white/5"}`}>
                  <span className="rounded-full inline-block flex-shrink-0" style={{ width: 6, height: 6, backgroundColor: color, boxShadow: isBoss ? "0 0 6px #F1C40F" : "none" }} />
                  <div className="flex flex-col">
                    <span className={`text-[10px] font-mono leading-tight ${isBoss ? "text-amber-300 font-bold" : "text-zinc-300"}`}>{isBoss ? "👑 " + a.name : a.name}</span>
                    <span className="text-[8px] font-mono text-zinc-500 leading-tight">{agent?.role}</span>
                  </div>
                  <span className={`text-[9px] font-mono ml-0.5 flex-shrink-0 ${a.status === "working" ? "text-emerald-400" : "text-amber-400"}`}>
                    {a.status === "working" ? "●" : "○"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Talk to the boss */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-zinc-500 whitespace-nowrap">💬 Talk to the boss:</span>
            <input
              type="text"
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitFeedback(); }}
              placeholder="Leave feedback for Nova..."
              maxLength={1000}
              disabled={feedbackSending}
              className="flex-1 bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 font-mono focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 disabled:opacity-50"
            />
            <button
              onClick={submitFeedback}
              disabled={!feedbackText.trim() || feedbackSending}
              className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-mono px-3 py-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {feedbackSending ? "..." : "Send"}
            </button>
            {feedbackSent && (
              <span className="text-[10px] font-mono text-emerald-400 animate-pulse">✓ Sent!</span>
            )}
          </div>
        </div>

        {/* Right column: Mini leaderboard (bottom-aligned with left) */}
        {leaderboard.length > 0 && (
          <div className="bg-white/5 rounded-lg px-3 py-2 min-w-[200px]">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2">Weekly Contributions</div>
            {leaderboard.slice(0, 6).map((entry, i) => (
              <div key={entry.userId} className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-mono font-bold w-3 ${
                    i === 0 ? "text-amber-400" : i === 1 ? "text-zinc-400" : i === 2 ? "text-orange-400" : "text-zinc-600"
                  }`}>{i + 1}</span>
                  <span className="text-[11px] font-mono text-zinc-300">{entry.name.split(" ")[0]}</span>
                </div>
                <span className="text-[11px] font-mono text-emerald-400/80">+{entry.earned}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
