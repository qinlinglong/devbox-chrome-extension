self.onmessage = (event) => {
  try {
    const source = String(event.data?.source ?? '');
    const pattern = String(event.data?.pattern ?? '');
    let flags = String(event.data?.flags ?? 'g');
    if (!flags.includes('g')) flags += 'g';
    const regex = new RegExp(pattern, flags);
    const matches = [];
    let match;
    while ((match = regex.exec(source)) && matches.length < 10000) {
      matches.push(match[0]);
      if (match[0] === '') regex.lastIndex++;
    }
    self.postMessage({ ok: true, result: matches.join('\n') || '没有匹配结果' });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || '正则表达式无效' });
  }
};
