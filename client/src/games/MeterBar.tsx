import { useEffect, useRef, useState } from 'react';

/** 来回摆动的力度条。服务器告诉我们“已经过了多少毫秒”，这里在本地继续动画（位置的真正判定在服务器上）。 */
/**
 * meter：来回摆动的指针（正在瞄准时）；frozen：点击之后指针停住的位置（显示这一次点在了哪里），
 * 这样玩家能看到自己点的位置和服务器判定的位置是一致的。
 */
export default function MeterBar({ meter, zone, frozen = null }: { meter: { sinceMs: number; period: number } | null; zone: number; frozen?: number | null }) {
  const received = useRef({ at: performance.now(), since: 0 });
  const [pos, setPos] = useState(0);

  useEffect(() => {
    if (!meter) return;
    received.current = { at: performance.now(), since: meter.sinceMs };
    let raf = 0;
    const tick = () => {
      const t = received.current.since + (performance.now() - received.current.at);
      const u = (((t % meter.period) + meter.period) % meter.period) / meter.period;
      setPos(u < 0.5 ? u * 2 : 2 - 2 * u);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [meter?.sinceMs, meter?.period]);

  if (!meter) {
    if (frozen === null) return null;
    return (
      <div className="meter frozen">
        <div className="meter-zone" style={{ left: `${(0.5 - zone) * 100}%`, width: `${zone * 200}%` }} />
        <div className="meter-center" />
        <div className="meter-pin" style={{ left: `${frozen * 100}%` }} />
      </div>
    );
  }
  return (
    <div className="meter">
      <div className="meter-zone" style={{ left: `${(0.5 - zone) * 100}%`, width: `${zone * 200}%` }} />
      <div className="meter-center" />
      <div className="meter-pin" style={{ left: `${pos * 100}%` }} />
    </div>
  );
}
