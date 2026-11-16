// 游戏数据：货物、陈设、任务、对白
export const CAPACITY = 8;
export const SELL_MARKUP = 1.52;
export const START_CAPITAL = 500;

export const GOODS = {
  rice: { name: '江南稻米', unit: '石', base: 30, src: 'zhou', buyer: 'sun', desc: '新到的白米，酒楼日日要用' },
  tea: { name: '明前新茶', unit: '篓', base: 64, src: 'zhou', buyer: 'xiang', desc: '清明前采的头茶，香药铺兼收' },
  spice: { name: '沉檀香料', unit: '匣', base: 108, src: 'zhou', buyer: 'xiang', desc: '海舶来的沉香檀香，上色好货' },
  silk: { name: '吴绫蜀锦', unit: '匹', base: 150, src: 'zhou', buyer: 'silk', desc: '本大利也大，匹帛铺最是识货' },
  charcoal: { name: '上等木炭', unit: '篓', base: 22, src: 'ding', buyer: 'sun', desc: '郊外烧的硬木炭，酒楼灶上离不得' },
  bamboo: { name: '带泥春笋', unit: '筐', base: 16, src: 'ding', buyer: 'sun', desc: '今晨才掘的笋，图个时鲜' },
};

// kind：table 可置于案几或地面；floor 仅地面；wall 悬于壁上
export const DECOR = {
  orchid: { name: '春兰', shop: 'flower', price: 90, kind: 'table', desc: '一盆幽兰，叶如剑、花如蝶，置于案头最宜。' },
  blossom: { name: '瓶插杏花', shop: 'flower', price: 110, kind: 'table', desc: '清明时节的杏花，折两枝插在白瓷瓶里。' },
  bonsai: { name: '黄杨盆景', shop: 'flower', price: 150, kind: 'table', desc: '盘根虬干，方寸之间自有山林气。' },
  rock: { name: '太湖石', shop: 'flower', price: 400, kind: 'floor', desc: '瘦、皱、漏、透，立于庭中便成一景。' },
  teaset: { name: '定窑白瓷茶具', shop: 'porcelain', price: 130, kind: 'table', desc: '一壶四盏，白如凝脂，点茶待客皆体面。' },
  meiping: { name: '汝窑天青梅瓶', shop: 'porcelain', price: 180, kind: 'table', desc: '雨过天青云破处，这般颜色做将来。' },
  basin: { name: '钧窑鼓钉洗', shop: 'porcelain', price: 240, kind: 'table', desc: '入窑一色，出窑万彩，一抹玫瑰紫最是难得。' },
  bigvase: { name: '龙泉青瓷大瓶', shop: 'porcelain', price: 320, kind: 'floor', desc: '梅子青釉，配了花梨木座，宜置堂屋两侧。' },
  callig: { name: '行书条幅', shop: 'antique', price: 220, kind: 'wall', desc: '“清风明月本无价”，笔意萧散，可悬于壁。' },
  censer: { name: '博山铜香炉', shop: 'antique', price: 210, kind: 'table', desc: '炉盖层峦叠嶂，焚一炷沉香，烟出如云。' },
  landscape: { name: '溪山行旅图轴', shop: 'antique', price: 360, kind: 'wall', desc: '仿范中立笔意，山势雄浑，挂在堂屋正中最好。' },
  guqin: { name: '古琴与琴案', shop: 'antique', price: 480, kind: 'floor', desc: '仲尼式，桐面梓底，纵不会弹，也添三分雅气。' },
  screen: { name: '山水座屏', shop: 'antique', price: 620, kind: 'floor', desc: '三扇折屏，烟江叠嶂，往堂上一立，气象便不同。' },
};

export const ROLES = [
  { id: 'merchant', name: '商贾', who: '沈员外', desc: '家住城内甜水巷。往来码头与街市，贩货营生，添置家当。', open: true },
  { id: 'boatman', name: '船工', who: '周家伙计', desc: '操舟汴河，南来北往，放桅过虹桥。', open: false },
  { id: 'doctor', name: '郎中', who: '赵太丞门下', desc: '悬壶济世，望闻问切，识遍百草。', open: false },
  { id: 'teller', name: '说书人', who: '霍四究弟子', desc: '一张嘴、一把扇，说尽汴京事。', open: false },
  { id: 'porter', name: '脚夫', who: '码头力工', desc: '肩挑背扛，穿街走巷，最知街面冷暖。', open: false },
];

export const INTRO = [
  '北宋宣和年间，东京汴梁。',
  '清明时节，杨柳抽新。你是城中商贾沈员外，今晨往郊外祭扫已毕，正沿汴河北岸的土路回城。',
  '过虹桥，入城门，家就在城内十字街北的甜水巷里——娘子还等着你回去呢。',
];

export const QUESTS = [
  { title: '归家', desc: '循小地图上的朱线西行：过虹桥、入城门，回到甜水巷的沈宅。', target: 'home' },
  { title: '见娘子', desc: '娘子芸娘正在院中等候，上前同她说说话。', target: 'wife' },
  { title: '收货', desc: '江南纲船已泊汴河码头。去找船主周老大收些货物。', target: 'zhou' },
  { title: '转卖', desc: '把货运进城：绸缎卖匹帛铺，香料新茶卖香药铺，米炭鲜货送孙羊正店。', target: 'buyer' },
  { title: '添置', desc: '手头宽裕了。去瓷器铺、花木担或墨缘斋，为家里挑一件陈设。', target: 'decorshop' },
  { title: '布置', desc: '把陈设带回家，在院中或堂屋里按 B 摆放。', target: 'home' },
  { title: '复命', desc: '摆好了，请娘子来瞧瞧。', target: 'wife' },
  { title: '自在营生', desc: '往来贩货，赚了钱便添置家当，把沈宅布置得雅致些。', target: null },
];

export const TALK = {
  wifeFirst: [
    { who: '芸娘', text: '官人回来了！郊外风大，一路可还顺当？' },
    { who: '你', text: '还好。城外柳色正新，汴河上的漕船挤得满满当当。' },
    { who: '芸娘', text: '正要同你说呢——听隔壁王婆讲，江南的纲船昨夜到了，码头上新茶、绸缎、香料堆得小山一般。' },
    { who: '芸娘', text: '家里这点本钱，放着也是放着。不如去码头收些货，运进城里转卖，赚个差价。' },
    { who: '芸娘', text: '这是五百文，官人收好。', give: 500 },
    { who: '芸娘', text: '记着：出城往东，到汴河码头寻纲船的周老大收货。进了城，绸缎卖给王家罗锦匹帛铺，香料新茶卖刘家香药铺，米炭鲜货送孙羊正店。' },
    { who: '芸娘', text: '赚了钱，也给家里添几样摆设罢——这堂屋空落落的，来了客人都不像样。' },
  ],
  wifeWaiting: [
    { who: '芸娘', text: '官人还没动身？码头在城外东边，过了虹桥沿河走便是。小地图上有朱线指着呢。' },
  ],
  wifeTrading: [
    { who: '芸娘', text: '买卖上的事，官人自己拿主意。只一条：别把本钱都压在一样货上。' },
  ],
  wifeBroke: [
    { who: '芸娘', text: '怎的，本钱周转不开了？……罢了，这是奴家攒下的二百文体己，官人先拿去用。', give: 200 },
    { who: '芸娘', text: '下回可得仔细些，看准了行情再下手。' },
  ],
  wifeDecorBought: [
    { who: '芸娘', text: '买了摆设回来？快寻个地方摆上——在院里或堂屋中按 B 便可布置。' },
  ],
  wifeDecorDone: [
    { who: '芸娘', text: '这……摆得真好。' },
    { who: '芸娘', text: '成亲这些年，家里总算有些样子了。往后官人在外头奔波，奴家看着它，心里也是暖的。' },
    { who: '你', text: '这才头一件。往后赚了钱，咱们慢慢添。' },
    { who: '芸娘', text: '嗯。花木担的盆景、瓷器铺的茶具、墨缘斋的字画……奴家都惦记着呢。官人量力而行便是。' },
  ],
  wifeFree: [
    [{ who: '芸娘', text: '官人辛苦。灶上温着汤饼，歇歇脚再走。' }],
    [{ who: '芸娘', text: '今早隔壁王婆又来串门，直夸咱家院里那株杏花开得好。' }],
    [{ who: '芸娘', text: '听说孙羊正店近来客满，米炭收得紧。官人若去码头，不妨多带些。' }],
    [{ who: '芸娘', text: '虹桥上人多，官人过桥时留神脚下，也当心钱囊。' }],
  ],
  wifeRich: [
    { who: '芸娘', text: '官人你瞧，堂上有画，案上有瓶，院里有石——咱家如今比那王员外家也不差了！' },
    { who: '芸娘', text: '奴家别无所求，只愿年年清明，都同官人这样好好地过。' },
  ],
  zhou: [
    { who: '周老大', text: '沈员外！稀客稀客。这船刚从江南上来，舱里都是好货，您瞧瞧？' },
  ],
  zhouAgain: [{ who: '周老大', text: '员外又来照顾生意？今日的货色都在这儿了。' }],
  ding: [
    { who: '丁老汉', text: '员外回城啊？老汉这儿有刚出窑的炭、今晨掘的笋，城里酒楼抢着要，捎两篓去？' },
  ],
  sun: [{ who: '孙掌柜', text: '沈员外来得正好！灶上的米、炭、时鲜，小店来者不拒。' }],
  xiang: [{ who: '刘掌柜', text: '员外带了香料还是新茶？小铺“上色沉檀”，只收好货，价钱自然也公道。' }],
  silk: [{ who: '王掌柜', text: '可有吴绫蜀锦？眼下各家都在裁春衫，料子正俏。' }],
  porcelain: [{ who: '柴掌柜', text: '汝州来的好瓷，员外随意看。瓷器这东西，摆在家里，日子便清雅了。' }],
  antique: [{ who: '米先生', text: '沈兄请进。小斋字画古玩，不敢说件件名品，倒也耐看。' }],
  flower: [{ who: '花婆婆', text: '员外瞧瞧花？清明前后，杏花兰草最是时候，给娘子带一盆回去罢。' }],
  nothingToSell: '眼下你身上没有这家铺子要收的货。',
  story: [
    [{ who: '霍四究', text: '……话说那刘玄德三顾茅庐，头一回去，偏偏卧龙先生不在！列位，你道急人不急人？' }],
    [{ who: '霍四究', text: '这位员外且站一站，听完这一回再走——不要钱，听得好，赏个彩头便是。' }],
  ],
  tax: [
    [{ who: '税吏', text: '进城的货都要在此验看。沈员外是熟面孔了，照章纳税，自然放行。' }],
    [{ who: '税吏', text: '今日驼队出城，门道里挤，员外靠南边走。' }],
  ],
  zhao: [
    [{ who: '赵太丞', text: '员外气色不错。只是春日肝木旺，少饮些酒。若是席间贪杯，小铺有“集香丸”，专治酒伤。' }],
    [{ who: '赵太丞', text: '老夫这铺子在街尾，图个清静。员外再往西，便是画卷的尽头了。' }],
  ],
};

export const KEY_HINTS = 'W A S D 行走 · 鼠标环顾 · Shift 疾行 · 空格 跃 · V 换视角 · E 交谈 · M 画卷 · Tab 行囊 · B 布置（家中） · P 留影 · Esc 暂停';
