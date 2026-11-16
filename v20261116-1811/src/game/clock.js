// 时辰：游戏里的一昼夜 = 现实里的三十分钟，一个时辰两分半钟。
// 现在是什么时辰由联网时间定（向游戏自己所在的服务器问一次时间，算出本机时钟差了多少），
// 所以各人同一时刻看到的是同一个时辰，改本机时钟也没用；连不上网时才照本机时钟走。
export const DAY_MS = 30 * 60 * 1000;
export const SHICHEN = '子丑寅卯辰巳午未申酉戌亥';

export class Clock {
  constructor() {
    this.offset = 0; // 联网时间 − 本机时间（毫秒）
    this.source = 'local'; // 'net' 已按联网时间校过；'local' 用的是本机时间
    this.fixed = null; // 调试用：把钟点定在某一刻（0~24）
    this.fast = false; // 调试用：一分钟过完一天
  }
  now() {
    return Date.now() + this.offset;
  }
  // 游戏里的钟点，0~24（0 为子正，即半夜）
  hour() {
    if (this.fixed !== null) return this.fixed;
    const span = this.fast ? 60 * 1000 : DAY_MS;
    return ((this.now() % span) / span) * 24;
  }
  // 子时自 23 点起，每两个钟点一个时辰
  static shichen(h) {
    return SHICHEN[Math.floor((((h + 1) % 24) + 24) % 24 / 2)];
  }
  // 向服务器问时间：取响应头里的 Date。问不到（离线、被拦）就保持用本机时间
  async sync() {
    try {
      const t0 = performance.now();
      const r = await fetch(location.pathname + '?_=' + Date.now().toString(36), { method: 'HEAD', cache: 'no-store' });
      const t1 = performance.now();
      const d = Date.parse(r.headers.get('date') || '');
      if (!d) throw new Error('no date');
      // Date 只精确到秒（取中加半秒）；经缓存转手的再加上 Age；往返耗时折半
      const server = d + 500 + (Number(r.headers.get('age')) || 0) * 1000 + (t1 - t0) / 2;
      this.offset = Math.round(server - Date.now());
      this.source = 'net';
    } catch {
      this.offset = 0;
      this.source = 'local';
    }
    return this.source;
  }
}
