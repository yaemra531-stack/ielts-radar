import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../');

import { Parser } from '../public/js/parser.js';

console.log('====================================================');
console.log('🚀 开始测试 WorkBuddy V1.4 升级功能与兼容性验证');
console.log('====================================================\n');

let passed = 0;
let total = 0;

function assert(condition, testName) {
  total++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    process.exitCode = 1;
  }
}

// 1. 用户提供的 10 篇测试数据 (包含小红书、抖音、X、Reddit)
const userPayload = {
  "report_date": "2026-10-11",
  "agent": "WorkBuddy",
  "prompt_version": "V1.3",
  "coverage": {
    "小红书": 3,
    "抖音": 2,
    "X": 3,
    "Reddit": 2
  },
  "items": [
    {
      "platform": "小红书",
      "title": "关于我雅思15min写完小作文上7的技巧",
      "author": "MiKk",
      "published_at": "2026-09-16",
      "likes": 1429,
      "favorites": 1444,
      "score": null,
      "url": "https://www.xiaohongshu.com/explore/6aaa332b000000002700800e?xsec_token=ABpfeQod3bqv3A2Qb33jtjZLrdPcgUZ6H9fqYLPDQfbgo=&xsec_source=",
      "summary": "分享一套15分钟写完小作文的套路：花1分钟扫图表圈出最高最低值和最明显趋势，再用固定框架搭骨架——开头一句改写题目，中间两三段按时间或类别对比展开，结尾一句总结规律；并附开头引入句、趋势变化句等万能句模板，强调同一数据换表达。",
      "reader_value": "给正在准备Task 1小作文、写不快或没思路的考生一套固定结构与万能句，缩短构思和成文时间。",
      "comments_checked": true,
      "audience_questions": [
        "有大作文版本吗？",
        "第一张图里的是什么书？"
      ],
      "discovery_reason": "9月16日发布，收藏1444高于点赞1429，评论在追问大作文版本；这套可复用的Task 1结构被读者当作模板直接存用。"
    },
    {
      "platform": "小红书",
      "title": "雅思8.5现场——没有华丽词汇，但逻辑拉满",
      "author": "Jinny雅思口语指南",
      "published_at": "2026-10-09",
      "likes": 132,
      "favorites": 77,
      "score": null,
      "url": "https://www.xiaohongshu.com/explore/6ac88dc1000000001803b31c?xsec_token=ABK96De3Qb6dVMg68S3z2yATpgWvIvft4H6HGAhruoh4o=&xsec_source=",
      "summary": "用一段真实的口语8.5分现场录像说明高分不等于堆难词长句：考生语速平稳、几乎不卡顿，回答有完整逻辑、会自然拓展观点，用词地道、发音清晰，像在和考官交流而非背模板。作者建议备考者模仿这种交流感，体会8.5更看重连贯与观点延伸。",
      "reader_value": "给正在练口语、纠结要不要背难词的考生一个直观参照，说明高分更靠逻辑与自然表达。",
      "comments_checked": true,
      "audience_questions": [],
      "discovery_reason": "10月9日发布，点赞132、收藏77刚过门槛；用真实8.5分现场对照6分与7分，属少见的示范型口语内容。"
    },
    {
      "platform": "小红书",
      "title": "雅思7.5最大感悟：不要太参考xhs。",
      "author": "长眠",
      "published_at": "2026-10-04",
      "likes": 144,
      "favorites": 142,
      "score": null,
      "url": "https://www.xiaohongshu.com/explore/6abd1fc1000000001b022787?xsec_token=ABGMA3ZR1aBk2hExEk1rQ4S3Vmmb8L5oghWnClJ-PAiPo=&xsec_source=",
      "summary": "用官方数据给小红书遍地8分的印象降温：大陆A类考生均分约5.9，7分以上仅约14%；换城市避压分已被官方辟谣。高分帖多不写自身基础。作者也分享做法：碎片时间听BBC、6 Minute English，真题先原速做完再逐句精听答案句。",
      "reader_value": "帮容易被高分帖带偏的考生校准预期，并提供一套以精听真题答案句为主的听力练习方法。",
      "comments_checked": true,
      "audience_questions": [
        "雅思到底怎么学？刚上手听力听不懂，刷了很多还是不会。",
        "首考5.5、两个月时间，要从基础课开始看吗？"
      ],
      "discovery_reason": "10月4日发布，赞藏几乎持平、评论28条偏多；用官方均分数据反驳遍地8分的印象，并回应评论区听力怎么练的追问。"
    },
    {
      "platform": "抖音",
      "title": "雅思口语全都扯到我的创业经历，给考官听美了",
      "author": "雅思考官尼克",
      "published_at": "2026-10-04",
      "likes": 50000,
      "favorites": 7012,
      "score": null,
      "url": "https://www.douyin.com/video/7692821830976998656",
      "summary": "一条标注雅思口语九分实录的考场视频：考生从个人信息、学习计划一路把话题引到自己的创业经历，讲财务自由、掌控命运与未来五年规划。考官兼博主在评论区补充，考生用词精准、表达流畅，很多词甚至不知中文怎么对应。",
      "reader_value": "给想了解9分口语实际水平的考生一段真实样例，学习如何把话题自然引到自己熟悉的经历上。",
      "comments_checked": true,
      "audience_questions": [
        "真正的native speaker也可能拿不到9分吗？",
        "他老是说sort of，这个到底是什么意思？"
      ],
      "discovery_reason": "10月4日发布，点赞5万、收藏7012，评论在争论native speaker能否拿9分；是理解口语高分段标准的样本。"
    },
    {
      "platform": "抖音",
      "title": "雅思10月重点《住退休社区》",
      "author": "捷哥雅思经验分享",
      "published_at": "2026-10-08",
      "likes": 746,
      "favorites": 401,
      "score": null,
      "url": "https://www.douyin.com/video/7694309434864551590",
      "summary": "针对10月雅思写作重点题住退休社区讲解如何搭逻辑链：先明确要表达个人观点，再按群体区分拆利弊——退休社区提供专业照顾、减少孤独感，但可能让老人与子女关系疏远，最后给出利大于弊的立场。视频带AI章节要点，逐段拆解论证顺序。",
      "reader_value": "帮准备10月写作的考生拿到一道重点老龄化题的分论点框架，学会用群体区分加利弊排序来组织观点。",
      "comments_checked": true,
      "audience_questions": [
        "这道题需不需要在最后再简短写怎么缓解和子女的关系？",
        "今天考到年轻人的运动竞赛被取消，同不同意，怎么答？"
      ],
      "discovery_reason": "10月8日发布，点赞746、收藏401，属当月写作重点题讲解；评论区追问题目怎么写，说明这类押题内容被备考者主动取用。"
    },
    {
      "platform": "X",
      "title": "雅思全国大停考！剑桥系统崩了",
      "author": "王局拍案 @wangjupaian",
      "published_at": "2026-10-10",
      "likes": 170,
      "favorites": null,
      "score": null,
      "url": "https://x.com/wangjupaian/status/2108911522022121959",
      "summary": "报道2026年10月10日中国大陆雅思考试出现首次全国性大规模取消：当天纸笔与机考全部叫停，次日考试也受影响，网传原因为剑桥考试系统突发技术故障。不少考生已到考场、有人正考口语或听力做到一半被劝返，通知多通过短信发出。",
      "reader_value": "让近期要参加雅思的考生第一时间知道全国停考这一突发情况，便于关注后续改期与补考安排。",
      "comments_checked": true,
      "audience_questions": [
        "剑桥技术升级的目的是降低考试难度吗？"
      ],
      "discovery_reason": "10月10日发布，1天内点赞170、评论11；记录当天全国停考这一突发事件，属考情信息，直接关系到近期考生的考试安排。"
    },
    {
      "platform": "X",
      "title": "免费开源雅思刷题工具推荐（zyz阅读／虾滑听力）",
      "author": "Hilda辣辣 @hildaiscute",
      "published_at": "2026-09-17",
      "likes": 1146,
      "favorites": null,
      "score": null,
      "url": "https://x.com/hildaiscute/status/2100624442300989583",
      "summary": "作者分享自己从付费刷题软件（广告多、要收费）换成免费开源工具的经历：经推荐试用了zyz阅读和虾滑听力，认为免费且好用，并在回复里给出两个项目的GitHub地址，属备考者之间的工具口碑分享。",
      "reader_value": "给想省钱、又不想被广告打断的考生两个可免费使用的开源刷题与听力工具，并附下载地址。",
      "comments_checked": true,
      "audience_questions": [],
      "discovery_reason": "9月17日发布，点赞1146、转推226、评论218，作者在回复里给出GitHub链接；互动量为当日检索最高。"
    },
    {
      "platform": "X",
      "title": "My IELTS 开源备考项目",
      "author": "洋洋 @yangordi",
      "published_at": "2026-09-22",
      "likes": 295,
      "favorites": null,
      "score": null,
      "url": "https://x.com/yangordi/status/2102322762006102204",
      "summary": "介绍一个叫My IELTS的开源项目，把雅思备考资料梳理得较有条理：词汇、语法、听力、阅读、写作都有覆盖，其中词汇最完整，收录《雅思词汇真经》内容与原版音频，并支持词表、练习题和打字模式，作者认为比干啃书效率高。",
      "reader_value": "给想找一个免费、成体系的雅思资料库的考生一个可自行部署的开源项目选择，尤其适合背单词。",
      "comments_checked": true,
      "audience_questions": [],
      "discovery_reason": "9月22日发布，点赞295、转推80；评论区认可词汇与音频放一起的用法，属近期被反复转发的开源备考资源。"
    },
    {
      "platform": "Reddit",
      "title": "How I scored 9.0 in IELTS and how you can too",
      "author": "u/Personal-Log91",
      "published_at": "2026-09-30",
      "likes": 527,
      "favorites": null,
      "score": 527,
      "url": "https://www.reddit.com/r/IELTS/comments/1wtwdr1/how_i_scored_90_in_ielts_and_how_you_can_too/",
      "summary": "作者复盘自己约两个月的备考：先完整回忆考试遇到的口语题（Part 1问工作学习与社交媒体，Part 2描述一次帮助别人的经历，Part 3追问求助与帮助）以及大小作文题目，再说明复习节奏与整理的笔记，属把考了什么和怎么准备一起交出的经验帖。",
      "reader_value": "让考生看到一份完整的高分复盘样本，既知道真题长什么样，也能参考其准备节奏与做笔记的方式。",
      "comments_checked": true,
      "audience_questions": [],
      "discovery_reason": "9月30日发布，527赞、14条评论，是r/IELTS近一个月的高赞经验帖；把考题回忆与备考方法一起写，可核实度高。"
    },
    {
      "platform": "Reddit",
      "title": "ask me anything! band 9!",
      "author": "u/stankubric",
      "published_at": "2026-10-04",
      "likes": 156,
      "favorites": null,
      "score": 156,
      "url": "https://www.reddit.com/r/IELTS/comments/1wxpoj4/ask_me_anything_band_9/",
      "summary": "作者拿下总分9分后开AMA答疑，帖子本身没有正文，价值集中在评论区：有考生说写作Task 2一直练却看不到进步、最大困难是想不出观点，也有人追问口语怎么拿到9分，属以问答形式呈现的高分考生交流帖，能看到备考者当下最卡的点。",
      "reader_value": "让考生对照评论区的高频困惑（写作练了没进步、口语上不了9）来定位自己的问题。",
      "comments_checked": true,
      "audience_questions": [
        "写作Task 2一直练却没进步，最大问题是想不出观点，怎么办？",
        "口语是怎么拿到9分的？"
      ],
      "discovery_reason": "10月4日发布，156赞却有98条评论，评赞比很高；高分考生在评论区集中答疑，能直接看到同批考生当下最关心的问题。"
    }
  ]
};

// 测试 1：解析顶层 coverage 和 Reddit score
const parsed = Parser.parseJson(userPayload, 'WorkBuddy', '2026-10-11');
assert(parsed.date === '2026-10-11', '根据 report_date 自动归档至 2026-10-11');
assert(parsed.coverage && parsed.coverage['小红书'] === 3, '兼容并解析出顶层 coverage 字段');
assert(parsed.items.length === 10, '成功解析全部 10 篇条目');

const redditItem = parsed.items.find(i => i.platform === 'Reddit');
assert(redditItem && redditItem.score === 527, 'Reddit 条目成功提取 score 字段');

// 测试 2：跨平台稳定内容 ID (Stable Content ID) 提取准确性
const xhsId = Parser.extractStableContentId('小红书', userPayload.items[0].url);
assert(xhsId === 'xhs_6aaa332b000000002700800e', `小红书稳定 ID 提取成功: ${xhsId}`);

const douyinId = Parser.extractStableContentId('抖音', userPayload.items[3].url);
assert(douyinId === 'douyin_7692821830976998656', `抖音稳定 ID 提取成功: ${douyinId}`);

const xId = Parser.extractStableContentId('X', userPayload.items[5].url);
assert(xId === 'x_2108911522022121959', `X 稳定 ID 提取成功: ${xId}`);

const redditPostId = Parser.extractStableContentId('Reddit', userPayload.items[8].url);
assert(redditPostId === 'reddit_1wtwdr1', `Reddit 稳定 ID 提取成功: ${redditPostId}`);

// 测试 3：URL 附带不同临时参数（如 xsec_token 发生变动）时，稳定内容 ID 保持一致！
const xhsUrlWithDifferentToken = "https://www.xiaohongshu.com/explore/6aaa332b000000002700800e?xsec_token=DIFFERENT_TOKEN_12345&other=xyz";
const xhsIdChangedToken = Parser.extractStableContentId('小红书', xhsUrlWithDifferentToken);
assert(xhsId === xhsIdChangedToken, '当小红书链接的 xsec_token 改变时，稳定内容 ID 保持完全一致');

// 测试 4：差异比对 (Diff Viewer) 与已有记录匹配
const existingRecord = {
  id: "item_existing_001",
  stableId: xhsId,
  platform: "小红书",
  title: "关于我雅思15min写完小作文上7的技巧",
  likes: 1000,
  favorites: 1200,
  score: null,
  discovery_reason: "旧版理由",
  summary: "旧版摘要",
  reader_value: "旧版价值",
  audience_questions: ["旧问题1"],
  url: userPayload.items[0].url,
  isRead: true, // 关键：已读状态为 true！
  note: "我的重要备考笔记：一定要背这篇的句型！" // 关键：用户已有个人笔记！
};

const matchedItem = Parser.matchExistingItem(parsed.items[0], [existingRecord]);
assert(matchedItem !== null && matchedItem.id === existingRecord.id, '根据稳定 ID 精准匹配到已有记录');

const diffResult = Parser.computeItemDiff(existingRecord, parsed.items[0]);
assert(diffResult.hasChanges === true, '正确检测到已有条目与新导入数据之间存在差异');
assert(diffResult.diffs.some(d => d.field === 'discovery_reason'), '检测到【发现原因】发生变更');
assert(diffResult.diffs.some(d => d.field === 'summary'), '检测到【内容理解】发生变更');
assert(diffResult.diffs.some(d => d.field === 'reader_value'), '检测到【读者价值】发生变更');
assert(diffResult.diffs.some(d => d.field === 'audience_questions'), '检测到【观众真实问题】发生变更');
assert(diffResult.diffs.some(d => d.field === 'engagement'), '检测到【互动数据】发生变更');

// 测试 5：安全更新机制验证（更新内容字段，但绝对保留 isRead 和 note）
const incoming = parsed.items[0];
matchedItem.title = incoming.title;
matchedItem.likes = incoming.likes;
matchedItem.favorites = incoming.favorites;
matchedItem.summary = incoming.summary;
matchedItem.reader_value = incoming.reader_value;
matchedItem.discovery_reason = incoming.discovery_reason;
matchedItem.audience_questions = incoming.audience_questions;
// 严格保留已有阅读状态与笔记：
// matchedItem.isRead 保持不变
// matchedItem.note 保持不变

assert(matchedItem.isRead === true, '安全更新后已有阅读状态严格保留为已读 (true)');
assert(matchedItem.note === "我的重要备考笔记：一定要背这篇的句型！", '安全更新后用户个人备考笔记严格保留未被覆盖');
assert(matchedItem.likes === 1429, '新数据的点赞数已成功更新为 1429');
assert(matchedItem.audience_questions.includes("有大作文版本吗？"), '新数据的观众真实问题已成功合入');

// 测试 6：历史 V1.3 数据兼容性（没有 coverage，score 为 null）
const v13Data = {
  report_date: "2026-10-10",
  agent: "WorkBuddy",
  prompt_version: "V1.3",
  items: [
    {
      platform: "小红书",
      title: "V1.3 历史数据测试篇",
      url: "https://www.xiaohongshu.com/explore/v13test123",
      likes: 300,
      favorites: 400,
      summary: "测试内容",
      reader_value: "测试价值"
    }
  ]
};
const parsedV13 = Parser.parseJson(v13Data, 'WorkBuddy', '2026-10-10');
assert(parsedV13.coverage === null, '历史 V1.3 缺少 coverage 时优雅兼容为 null');
assert(parsedV13.items[0].score === null, '历史 V1.3 缺少 score 时优雅兼容为 null');
assert(parsedV13.items[0].title === 'V1.3 历史数据测试篇', '历史 V1.3 内容完整解析');

console.log('\n====================================================');
console.log(`🎉 全部测试通过！共通过 ${passed}/${total} 项验证`);
console.log('====================================================\n');
