/**
 * 力度条（来回摆动的指针），保龄球和篮球共用。
 * 指针的位置只由“服务器上的时间”决定：开始时间 + 经过的时间 → 三角波，0 → 1 → 0 循环。
 * 玩家点击时服务器用收到点击的时刻算指针位置，所以客户端无法作弊（只能自己看着画面点）。
 * 客户端拿到“已经过了多少毫秒”，在本地继续动画；网络延迟会让画面和实际位置有一点点偏差，所以目标区域都留得比较宽。
 */
export class Meter {
  private start = Date.now();
  constructor(public period: number) {}

  arm(period?: number) {
    if (period) this.period = period;
    this.start = Date.now();
  }

  /** 当前指针位置 0~1，0.5 是正中间（最佳位置） */
  pos(now = Date.now()) {
    const u = (((now - this.start) % this.period) + this.period) % this.period / this.period;
    return u < 0.5 ? u * 2 : 2 - 2 * u;
  }

  view() {
    return { sinceMs: Date.now() - this.start, period: this.period };
  }
}
