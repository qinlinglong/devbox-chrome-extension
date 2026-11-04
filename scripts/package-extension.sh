#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="$(sed -n 's/.*\"version\": \"\([^\"]*\)\".*/\1/p' "$root_dir/manifest.json" | head -n 1)"
output="${1:-$root_dir/../devbox-chrome-extension-${version}-release.zip}"

if [[ -z "$version" ]]; then
  echo "无法读取 manifest 版本号" >&2
  exit 1
fi

mapfile -t icon_files < <(find "$root_dir/icons" -maxdepth 1 -type f \( -name '*.svg' -o -name '*.png' \) -print | sort)
if [[ "${#icon_files[@]}" -lt 1 ]]; then
  echo "图标目录为空，停止打包：$root_dir/icons" >&2
  exit 1
fi

for required in icon16.png icon32.png icon48.png icon128.png; do
  [[ -f "$root_dir/$required" ]] || { echo "缺少扩展图标：$required" >&2; exit 1; }
done

rm -f "$output"
(
  cd "$root_dir"
  zip -q -r "$output" \
    manifest.json popup.html popup.css popup.js popup-keyboard.js paste-auto-run.js \
    tool-enhancements.js compare-actions.js compare-layout.css dark-theme.css \
    file-import-enhancements.js icon-fallback.css icon-fallback.js regex-worker.js \
    theme-settings.js workspace-search.css workspace-search.js workspace-switcher.css \
    workspace-switcher.js service-worker.js devtools.html devtools.js devtools-panel.html \
    devtools-panel.js devtools-panel.css privacy-policy.html \
    icon16.png icon32.png icon48.png icon128.png icons vendor
)

if ! unzip -tqq "$output"; then
  echo "发布包校验失败：$output" >&2
  exit 1
fi

packaged_icons=$(unzip -Z1 "$output" | awk '/^icons\/.*\.(svg|png)$/ {count++} END {print count+0}')
if [[ "$packaged_icons" -ne "${#icon_files[@]}" ]]; then
  echo "发布包图标数量不一致：源码 ${#icon_files[@]}，压缩包 $packaged_icons" >&2
  exit 1
fi

echo "已生成：$output"
echo "图标文件：$packaged_icons"
