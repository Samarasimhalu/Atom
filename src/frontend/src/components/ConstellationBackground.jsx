import { useEffect, useRef } from "react";

export default function ConstellationBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const net = {
      nodes: [],
      w: 0,
      h: 0,
      raf: 0,
      mx: -9999,
      my: -9999,
    };

    function sizeNet() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      net.w = w;
      net.h = h;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.max(35, Math.min(100, Math.round((w * h) / 14000)));
      while (net.nodes.length < count) {
        net.nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          r: 1 + Math.random() * 1.5,
        });
      }
      net.nodes.length = count;
    }

    function drawNet() {
      const n = net.nodes;
      const w = net.w;
      const h = net.h;
      const link = 140;

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < n.length; i++) {
        const p = n[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20) p.x = w + 20;
        else if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        else if (p.y > h + 20) p.y = -20;
      }

      ctx.lineWidth = 1;
      for (let i = 0; i < n.length; i++) {
        for (let j = i + 1; j < n.length; j++) {
          const dx = n[i].x - n[j].x;
          const dy = n[i].y - n[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < link) {
            ctx.strokeStyle = `rgba(125, 211, 252, ${((1 - d / link) * 0.45).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(n[i].x, n[i].y);
            ctx.lineTo(n[j].x, n[j].y);
            ctx.stroke();
          }
        }

        const mdx = n[i].x - net.mx;
        const mdy = n[i].y - net.my;
        const md = Math.sqrt(mdx * mdx + mdy * mdy);
        if (md < 180) {
          ctx.strokeStyle = `rgba(167, 139, 250, ${((1 - md / 180) * 0.65).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(n[i].x, n[i].y);
          ctx.lineTo(net.mx, net.my);
          ctx.stroke();
        }
      }

      ctx.shadowColor = "#7dd3fc";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#bae6fd";
      for (let i = 0; i < n.length; i++) {
        ctx.beginPath();
        ctx.arc(n[i].x, n[i].y, n[i].r, 0, 6.2832);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }

    function netLoop() {
      drawNet();
      net.raf = window.requestAnimationFrame(netLoop);
    }

    sizeNet();
    if (!reduceMotion) {
      net.raf = window.requestAnimationFrame(netLoop);
    } else {
      drawNet();
    }

    const onMove = (e) => {
      net.mx = e.clientX;
      net.my = e.clientY;
    };
    const onLeave = () => {
      net.mx = -9999;
      net.my = -9999;
    };
    const onResize = () => {
      sizeNet();
      if (reduceMotion) drawNet();
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseleave", onLeave);
    window.addEventListener("resize", onResize);

    return () => {
      if (net.raf) window.cancelAnimationFrame(net.raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      aria-hidden="true"
      style={{
        width: "100vw",
        height: "100vh",
        opacity: 0.75,
      }}
    />
  );
}
