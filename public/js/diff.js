/**
 * IELTS Radar - 提示词版本并排对比组件 (diff.js)
 * 实现高性能、清晰美观的 Side-by-side 差异比对
 */

export const DiffViewer = {
  /**
   * 极简而稳健的逐行差异计算算法 (LCS based)
   */
  computeDiff(textA = '', textB = '') {
    const linesA = textA.split('\n');
    const linesB = textB.split('\n');

    const m = linesA.length;
    const n = linesB.length;

    // 动态规划构建 LCS 矩阵
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (linesA[i - 1] === linesB[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // 回溯路径
    let i = m;
    let j = n;
    const diffRows = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
        diffRows.unshift({
          type: 'same',
          leftLine: i,
          leftText: linesA[i - 1],
          rightLine: j,
          rightText: linesB[j - 1]
        });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        diffRows.unshift({
          type: 'added',
          leftLine: null,
          leftText: '',
          rightLine: j,
          rightText: linesB[j - 1]
        });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        diffRows.unshift({
          type: 'removed',
          leftLine: i,
          leftText: linesA[i - 1],
          rightLine: null,
          rightText: ''
        });
        i--;
      }
    }

    return diffRows;
  },

  /**
   * 渲染并排对比 HTML
   */
  renderSideBySide(versionA, versionB) {
    if (!versionA || !versionB) {
      return '<div class="diff-empty">请选择两个版本进行对比</div>';
    }

    const rows = this.computeDiff(versionA.promptContent || '', versionB.promptContent || '');

    let html = `
      <div class="diff-container">
        <div class="diff-header">
          <div class="diff-col-header diff-left-header">
            <span class="diff-version-badge">${versionA.version}</span>
            <span class="diff-meta">${versionA.createdAt ? versionA.createdAt.split('T')[0] : ''} · ${versionA.reason || '无说明'}</span>
          </div>
          <div class="diff-col-header diff-right-header">
            <span class="diff-version-badge active">${versionB.version}</span>
            <span class="diff-meta">${versionB.createdAt ? versionB.createdAt.split('T')[0] : ''} · ${versionB.reason || '无说明'}</span>
          </div>
        </div>
        <div class="diff-body">
    `;

    rows.forEach(row => {
      const leftClass = row.type === 'removed' ? 'diff-line-removed' : (row.type === 'same' ? '' : 'diff-line-empty');
      const rightClass = row.type === 'added' ? 'diff-line-added' : (row.type === 'same' ? '' : 'diff-line-empty');

      const leftNum = row.leftLine !== null ? row.leftLine : '';
      const rightNum = row.rightLine !== null ? row.rightLine : '';

      const leftSign = row.type === 'removed' ? '-' : ' ';
      const rightSign = row.type === 'added' ? '+' : ' ';

      html += `
        <div class="diff-row type-${row.type}">
          <div class="diff-cell diff-cell-left ${leftClass}">
            <span class="diff-num">${leftNum}</span>
            <span class="diff-sign">${leftSign}</span>
            <span class="diff-text">${this.escapeHtml(row.leftText)}</span>
          </div>
          <div class="diff-cell diff-cell-right ${rightClass}">
            <span class="diff-num">${rightNum}</span>
            <span class="diff-sign">${rightSign}</span>
            <span class="diff-text">${this.escapeHtml(row.rightText)}</span>
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    return html;
  },

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};
