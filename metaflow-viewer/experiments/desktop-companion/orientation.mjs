// DeviceOrientation uses intrinsic Z-X'-Y'' rotations. The screen normal's
// vertical component is cos(beta) * cos(gamma); heading and UI rotation do not
// affect the angle between the screen plane and a level table.
export function tabletTilt(beta, gamma) {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const radians = Math.PI / 180;
  const normal = Math.abs(Math.cos(beta * radians) * Math.cos(gamma * radians));
  return Math.acos(Math.min(1, Math.max(0, normal))) / radians;
}

export function createTiltSensor({ onTilt = () => {}, onStatus = () => {}, environment = window } = {}) {
  let active = false, generation = 0, timer = 0, filtered = null, lastTime = 0;
  const receive = (event) => {
    const value = tabletTilt(event.beta, event.gamma);
    if (!active || value === null) return;
    clearTimeout(timer);
    const now = performance.now();
    const dt = lastTime ? Math.min((now - lastTime) / 1000, .3) : 1;
    lastTime = now;
    filtered = filtered === null ? value : filtered + (value - filtered) * (1 - Math.exp(-dt / .12));
    onTilt(filtered);
    onStatus('active', `设备倾角 ${filtered.toFixed(1)}° · 手动拖动倾角可停止感应`);
  };
  function stop(message = '使用手动倾角') {
    ++generation; active = false; clearTimeout(timer); filtered = null; lastTime = 0;
    environment.removeEventListener('deviceorientation', receive);
    onStatus('idle', message);
  }
  async function start() {
    const current = ++generation;
    const Api = environment.DeviceOrientationEvent;
    if (!Api || !environment.isSecureContext) {
      onStatus('unavailable', '此设备没有可用的方向传感器，请手动设置倾角。');
      return false;
    }
    onStatus('permission', '正在请求方向传感器权限');
    try {
      // Invoke in the original click activation; do not await camera/model work.
      const permission = typeof Api.requestPermission === 'function' ? await Api.requestPermission() : 'granted';
      if (current !== generation) return false;
      if (permission !== 'granted') { onStatus('denied', '未获得方向传感器权限，仍可手动设置倾角。'); return false; }
      active = true; filtered = null; lastTime = 0;
      environment.addEventListener('deviceorientation', receive);
      timer = setTimeout(() => { if (current === generation) stop('传感器没有返回数据，请手动设置倾角。'); }, 5000);
      onStatus('waiting', '等待设备倾角数据');
      return true;
    } catch (error) {
      if (current === generation) onStatus('denied', '方向传感器未能启用，请使用手动倾角。');
      return false;
    }
  }
  return { start, stop, get active() { return active; } };
}
