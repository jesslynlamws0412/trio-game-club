// 游戏名称、简介、规则的英文翻译。目前只有“支持英文”的游戏翻译了规则（见 EN_GAMES）。
export const CATALOG: Record<string, string> = {
  // ───── 名称与简介（所有游戏）─────
  '谁是卧底': "Who's the Undercover",
  '1 名卧底混在 2 名平民之中': '1 undercover hides among 2 civilians',
  '你画我猜': 'Draw & Guess',
  '轮流作画，其余玩家抢答': 'Take turns drawing; the others race to guess',
  '答题竞赛': 'Quiz Contest',
  '文史地理常识，快者得分': 'History, geography and general knowledge — be fast to score',
  '三人狼人杀': 'Werewolf (3 players)',
  '1 狼人 + 预言家 + 守卫': '1 werewolf + seer + guard',
  '大富翁': 'Monopoly',
  '掷骰买地，收租破产': 'Roll, buy property, collect rent, go bankrupt',
  '抽卡游戏': 'Card Draw',
  '命运、任务、惩罚与特殊事件': 'Fate, quests, punishments and special events',
  '海龟汤': 'Albatross Soup',
  '主持人出题，其余玩家是非题推理': 'The host sets a puzzle; others ask yes/no questions',
  '侦探推理': 'Detective',
  '搜集线索，找出真凶与动机': 'Collect clues to find the culprit and motive',
  '谁最有可能': 'Most Likely To',
  '同时投票，站在多数派得分': 'Vote at the same time — score by joining the majority',
  '默契大考验': 'Mind Meld',
  '和朋友选得一样，就是默契': 'Pick the same answer as your friends',
  '吹牛骰子': "Liar's Dice",
  '看自己的骰子，猜全场的点数': 'Look at your dice and bid on the whole table',
  '猜数字': 'Bulls & Cows',
  '1A2B，轮流猜出密码': 'Take turns cracking the secret code (1A2B)',
  '记忆翻牌': 'Memory Match',
  '轮流翻牌，配对得分': 'Flip cards in turns and match pairs',
  '真假判断': 'True or False',
  '10 条陈述，判断对错': '10 statements — true or false?',
  '剪刀石头布': 'Rock Paper Scissors',
  '7 轮同时出拳，赢一个对手得 1 分': '7 rounds, shoot together; beat an opponent to score',
  '成语接龙': 'Idiom Chain',
  '首字接末字，不能重复': 'Link the last character to the next first character',
  '真心话大冒险': 'Truth or Dare',
  '抽题挑战，大家投票判定': 'Draw a challenge; everyone votes on it',
  '反应速度挑战': 'Reaction Test',
  '看到“点！”立刻点击': 'Click the instant you see "GO!"',
  '井字棋': 'Tic-Tac-Toe',
  '3×3 棋盘，先连成三个': 'Get three in a row on a 3×3 board',
  '五子棋': 'Gomoku',
  '15×15 棋盘，先连成五个': 'Get five in a row on a 15×15 board',
  '禁忌词挑战': 'Taboo',
  '不能说出答案，也不能说禁忌词': "Describe the word without saying it or the taboo words",
  '蛇梯棋': 'Snakes & Ladders',
  '掷骰前进，遇梯上、遇蛇下': 'Roll to move — ladders up, snakes down',
  '飞行棋': 'Ludo',
  '掷 6 起飞，绕圈击落对手': 'Roll a 6 to launch, circle the board, send rivals home',
  '百万富翁': 'Millionaire',
  '15 道题，一路答到 RM 1,000,000': '15 questions up to RM 1,000,000',
  '谁是说谎者': "Who's Lying",
  '编一个像真的谎话，骗过所有人': 'Make up a convincing lie and fool everyone',
  UNO: 'UNO',
  '同色、同数字，先出完手牌': 'Match colour or number — be first to empty your hand',
  '叠叠高': 'Jenga',
  '轮流抽积木，谁抽倒谁输': 'Pull blocks in turns — whoever topples the tower loses',
  '保龄球': 'Bowling',
  '看准力度条，打出全中': 'Time the power bar and bowl a strike',
  '投篮机': 'Basketball',
  '指针到绿区，一击命中': 'Tap when the pointer hits the green zone',
  '羊了个羊': 'Triple Match',
  '三个相同就消除，托盘别放满': 'Match three to clear — keep the tray from filling up',
  '拼字游戏': 'Scrabble',
  'Scrabble：用字母牌拼英文单词': 'Build English words with letter tiles',

  // 知识问答类
  '常识问答': 'General Knowledge Quiz',
  '生活、科学、冷知识': 'Daily life, science and trivia',
  '中国历史问答': 'Chinese History Quiz',
  '从先秦到近代': 'From ancient times to modern China',
  '世界历史问答': 'World History Quiz',
  '古代文明到现代': 'From ancient civilisations to today',
  '中国文学问答': 'Chinese Literature Quiz',
  '名著、作家与名篇': 'Classics, authors and famous works',
  '世界文学问答': 'World Literature Quiz',
  '外国文学名著与作家': 'Foreign literary classics and authors',
  '马华文学问答': 'Malaysian Chinese Literature Quiz',
  '马来西亚华文文学': 'Chinese-language literature of Malaysia',
  '中国文化问答': 'Chinese Culture Quiz',
  '节日、典籍与习俗': 'Festivals, classics and customs',
  '世界地理问答': 'World Geography Quiz',
  '国家、城市与山川': 'Countries, cities and landscapes',
  '科学知识问答': 'Science Quiz',
  '物理化学生物天文': 'Physics, chemistry, biology and astronomy',
  '影视知识问答': 'Film & Animation Quiz',
  '电影与动画': 'Movies and animation',
  '音乐知识问答': 'Music Quiz',
  '乐器、作曲家与名曲': 'Instruments, composers and famous pieces',
  '成语知识问答': 'Idiom Quiz',
  '成语、词语与汉字': 'Idioms, words and characters',
  '古典诗词问答': 'Classical Poetry Quiz',
  '名句、作者与出处': 'Famous lines, poets and sources',
  '趣味冷知识问答': 'Fun Facts Quiz',
  '你可能不知道的小知识': 'Little things you may not know',
  '脑筋急转弯': 'Brain Teasers',
  '换个角度想一想': 'Think from a different angle',
  '逻辑推理': 'Logic Puzzles',
  '数列、推理与逻辑题': 'Number patterns, reasoning and logic',

  // ───── 开发中的游戏名称 ─────
  '猜词游戏': 'Word Guess',
  '诗词接龙': 'Poem Chain',
  '词语联想': 'Word Association',
  '文字炸弹': 'Word Bomb',
  '猜字谜': 'Riddles',
  '汉字拆解': 'Character Split',
  '词语填空': 'Fill the Blank',
  '文字拼接': 'Word Builder',
  '限时造句': 'Timed Sentences',
  '歇后语挑战': 'Chinese Two-Part Sayings',
  '近义词与反义词挑战': 'Synonyms & Antonyms',
  '找出说谎者': 'Find the Liar',
  '密室逃脱': 'Escape Room',
  '线索拼图': 'Clue Puzzle',
  '神秘案件': 'Mystery Case',
  '谁是凶手': 'Whodunit',
  '国际象棋': 'Chess',
  '扑克牌小游戏': 'Card Games',
  '数字华容道': 'Sliding Puzzle',
  '数独': 'Sudoku',
  '黑白棋': 'Reversi',
  '快问快答': 'Quick Fire',
  '故事接龙': 'Story Chain',
  '角色扮演推理': 'Role-play Mystery',
  '选择困难挑战': 'Tough Choices',
  '关键词联想': 'Keyword Link',
  '数字记忆': 'Digit Memory',
  '图案记忆': 'Pattern Memory',
  '限时计算': 'Speed Math',
  '颜色反应挑战': 'Colour Reflex',
  '记忆顺序': 'Sequence Memory',
  '快速找不同': 'Spot the Difference',
  '迷宫挑战': 'Maze Challenge',
  '限时生存挑战': 'Survival Challenge',

  // ───── 规则（只翻译支持英文的游戏）─────
  '40 格马来西亚版棋盘：8 个颜色组、4 个火车站、2 个公用事业。初始资金 RM1500，经过起点 +RM200。':
    'A 40-tile Malaysian board with 8 colour groups, 4 railway stations and 2 utilities. Everyone starts with RM1500 and collects RM200 for passing GO.',
  '掷骰移动，可购买无主地产，他人地产自动收租；掷出双数可以再掷一次，连续 3 次双数入狱。':
    "Roll to move and buy unowned properties; rent on other players' properties is paid automatically. Doubles give you another roll, but three doubles in a row sends you to jail.",
  '集齐同一颜色的全部地产后可盖房子（要均匀建造），4 栋房子后升级酒店，租金大幅上涨。':
    'Own every property of one colour to build houses (build evenly). After 4 houses you can upgrade to a hotel, which raises the rent a lot.',
  '监狱：付 RM50、用出狱卡，或掷出双数出狱，第 3 次失败强制保释。机会 / 命运卡会带来意外之财或灾难。':
    'Jail: pay RM50, use a Get Out of Jail card, or roll doubles. After a third failed roll you must pay bail. Chance / Fate cards bring windfalls or disasters.',
  '现金不足时先变卖建筑、再抵押地产，仍不足则破产。只剩 1 人或满 30 回合时，按总资产排名。':
    'If you cannot pay, buildings are sold first, then properties are mortgaged; if that is still not enough you go bankrupt. The game ends when one player is left or after 30 rounds, ranked by total assets.',

  '2~6 人，每人 7 张牌。出牌必须和弃牌堆顶的牌同颜色、同数字或同符号；万能牌随时可以出，并选择新的颜色。':
    '2–6 players, 7 cards each. Play a card that matches the top discard by colour, number or symbol. Wild cards can be played any time and let you choose a new colour.',
  '没有牌可出就摸一张，摸到能出的可以马上出，也可以选择不出（跳过）。':
    'If you cannot play, draw a card. If it can be played you may play it right away, or pass.',
  '功能牌：🚫 禁止（下家跳过）、🔄 反转（改变方向；两人时相当于禁止）、+2（下家摸 2 张并被跳过）、🌈 万能牌、+4 万能牌（选颜色，下家摸 4 张并被跳过）。+2 和 +4 不能叠加。':
    'Action cards: 🚫 Skip (next player loses a turn), 🔄 Reverse (changes direction; acts as Skip with two players), +2 (next player draws 2 and is skipped), 🌈 Wild, and Wild +4 (choose a colour; next player draws 4 and is skipped). +2 and +4 cannot be stacked.',
  '先出完手牌的人获胜（+3）；其余人按剩余牌数从少到多排名。手牌剩 1 张时系统自动喊 UNO。轮到你 60 秒不动，系统会替你出牌或摸牌。':
    'The first player to empty their hand wins (+3); the others are ranked by cards left. UNO is called automatically when you have one card left. If you do nothing for 60 seconds on your turn, the system plays or draws for you.',

  '18 层积木，每层 3 块。轮流抽出一块（最上面两层不能抽；只剩一块的那一层也不能抽），抽出的积木会放到塔顶。':
    '18 layers of 3 blocks. Pull one block in turn (not from the top two layers, nor from a layer with only one block left); the block you pull goes on top of the tower.',

  '每人打 10 格，每格最多两球（第 10 格有奖励球最多三球）。轮流打，每人打完一格换下一位。':
    'Each player bowls 10 frames with up to two balls per frame (up to three in the 10th). Players alternate, one frame at a time.',

  '每人 10 次投篮，轮流投：近距离 3 次、中距离 4 次、三分线 3 次。越远，绿色区域越窄，指针越快。':
    'Each player takes 10 shots in turn: 3 close, 4 mid-range and 3 from the three-point line. The farther the shot, the narrower the green zone and the faster the pointer.',
  '指针经过中间的绿色区域时点投篮：进球得分（近 / 中距离 2 分，三分线 3 分）；落在绿区正中算空心球，再 +1 分。':
    'Tap Shoot while the pointer is in the green zone: a basket scores 2 points (close / mid-range) or 3 (three-point line). Hitting the centre of the zone is a swish: +1 more point.',

  '三层叠起来的 72 张牌，8 种图案各 9 张。点没有被压住的牌，它会进入底部的 7 格托盘；托盘里集齐 3 张相同的就自动消除。':
    '72 tiles stacked in three layers, 9 tiles of each of 8 pictures. Tap a tile that is not covered and it moves to the 7-slot tray; three identical tiles in the tray clear automatically.',
  '托盘放满 7 张还没消除就失败；把所有牌都消除就通关。每人有一次道具：撤回上一步、洗牌、移出托盘最前面的 3 张。':
    'If the tray fills with 7 tiles and nothing clears, you lose; clear every tile to win. Each player has one use of each power-up: undo, shuffle, and remove the first 3 tiles from the tray.',
  '多人时大家用同一个牌堆比赛，各玩各的：先通关的人获胜（+3）；都没通关则比谁消除得多。单人通关 +3。这个游戏很难，通关不一定能做到。':
    'In multiplayer everyone races on the same layout, each on their own board: the first to clear wins (+3); if nobody clears, the one who cleared more wins. Solo clear: +3. This game is hard — clearing it is not guaranteed!',

  '100 格棋盘，轮流掷骰子前进。停在梯子底部就爬到梯子顶端，停在蛇头就滑到蛇尾。':
    'A 100-square board; take turns rolling to move. Land on the bottom of a ladder to climb to its top; land on a snake head to slide to its tail.',
  '必须刚好走到 100 才算到达终点，点数超出就原地不动。掷到 6 可以再掷一次，连续三个 6 这一轮作废。':
    'You must land exactly on 100; if the roll is too high you stay put. A 6 gives you another roll, but three 6s in a row void the turn.',
  '先到 100 的人获胜（+3）；其余玩家按所在格数排名。轮到你 60 秒不掷，系统会替你掷。':
    'The first to reach 100 wins (+3); the others are ranked by position. If you do nothing for 60 seconds, the system rolls for you.',

  '2~4 人，每人 4 架飞机，开始都在机库。掷到 6 才能让一架飞机起飞；掷到 6 可以再掷一次，连续三个 6 这一轮作废。':
    '2–4 players, 4 planes each, all starting in the hangar. Roll a 6 to launch a plane; a 6 also gives you another roll, but three 6s in a row void the turn.',
  '飞机沿 52 格公共跑道绕一圈，再进入自己的终点通道，必须刚好走到终点。':
    'Planes fly once around the 52-square shared track, then enter their own home lane and must land exactly on the finish.',
  '落在对手飞机所在的格子，会把对手击落回机库；起飞点和星形格（图中带星标记）是安全格，不会被击落。':
    "Landing on a square with an opponent's plane sends it back to the hangar; launch squares and star squares are safe and cannot be captured.",
  '为了缩短时间，先让 2 架飞机到达终点的人获胜（+3）。有多架飞机可走时由你选择走哪一架；只有一种走法时自动走。':
    'To keep games short, the first player to bring 2 planes home wins (+3). When several planes can move you choose which; if only one move is possible it is made automatically.',

  '两人轮流在 3×3 的格子里落子，横、竖、斜任意一条线上连成三个的人获胜。':
    'Two players take turns placing marks on a 3×3 grid; the first to get three in a row (across, down or diagonally) wins.',
  '一个人玩时对手是电脑（偶尔会失误，可以被打败）。先手每局轮换。':
    'When playing alone the opponent is the computer (it sometimes slips, so it can be beaten). The first move alternates each game.',
  '获胜 +3，平局各 +1，输 0。': 'Win +3, draw +1 each, loss 0.',

  '两人轮流在 15×15 的棋盘上落子（先手执黑），横、竖、斜任意一条线上连成五个或更多的人获胜。':
    'Two players take turns placing stones on a 15×15 board (the first player is Black); five or more in a row (across, down or diagonally) wins.',
  '一个人玩时对手是电脑，它会进攻也会防守。先手每局轮换。':
    'When playing alone the opponent is the computer; it attacks and defends. The first move alternates each game.',
  '获胜 +3，平局各 +1，输 0。轮到你 60 秒不下，系统会替你下一步。':
    'Win +3, draw +1 each, loss 0. If you do nothing for 60 seconds on your turn, the system plays a move for you.',

  '1~4 人，15×15 棋盘，100 张字母牌（含 2 张空白牌，可当任何字母），每人 7 张。要会拼英文单词！':
    '1–4 players, a 15×15 board and 100 letter tiles (including 2 blanks that can stand for any letter), 7 tiles each. You need to know English words!',
  '轮到你：把字母牌放在同一行或同一列，拼成英文单词（第一手要经过中心 ★，之后要和棋盘上已有的牌相连）；所有新形成的单词（包括旁边连在一起的）都要在词典里，否则不能提交。':
    'On your turn, place tiles in a single row or column to spell English words (the first word must cover the centre ★; later plays must connect to tiles already on the board). Every newly formed word (including cross-words) must be in the dictionary or the move is rejected.',
  '得分 = 字母分数之和。新放的牌压在彩色格子上有加成：浅蓝 2 倍字母、深蓝 3 倍字母、粉色 2 倍单词、红色 3 倍单词（只对新放的牌有效）。一次用完 7 张牌额外 +50。空白牌 0 分。':
    'Score = sum of letter values. Newly placed tiles on coloured squares get bonuses: light blue = double letter, dark blue = triple letter, pink = double word, red = triple word (new tiles only). Using all 7 tiles in one move earns +50. Blank tiles are worth 0.',
  '你也可以换牌（牌袋里至少还有 7 张时）或跳过。一人用完牌且牌袋已空，或连续多手没人得分，游戏结束：剩余字母牌的分数会被扣掉。分数最高者获胜：第一 +3、第二 +2、第三 +1。轮到你 60 秒不动，系统会替你跳过。':
    'You may also exchange tiles (when at least 7 remain in the bag) or pass. The game ends when a player empties their rack with the bag empty, or after several scoreless turns in a row; leftover tile values are deducted. Highest score wins: 1st +3, 2nd +2, 3rd +1. If you do nothing for 60 seconds, the system passes for you.',

  '6×6 共 36 张牌，18 对图案，开局全部盖着。': '36 cards in a 6×6 grid, 18 pairs of pictures, all face down at the start.',
  '轮到你时翻开两张：图案相同则配对成功，+1 分并继续翻；不同则盖回去，换下一位。':
    'On your turn flip two cards: if they match you score +1 and flip again; if not they are turned back and the next player goes.',
  '所有牌配完后按配对数排名：第一 +3、第二 +2、第三 +1 计入总积分（同分并列）。':
    'When all pairs are found, players are ranked by pairs: 1st +3, 2nd +2, 3rd +1 added to the total score (ties share).',

  '每人 3 颗骰子，只有自己能看到。每轮从一位玩家开始轮流叫数：“全场至少有 N 个 X 点”。':
    'Each player has 3 dice that only they can see. Players take turns bidding: "there are at least N dice showing X on the table".',
  '1 点是万能点，可以当作任何点数，所以只能叫 2~6 点。':
    'Ones are wild and count as any number, so you can only bid 2–6.',
  '轮到你时可以加注（数量更多，或数量相同但点数更大），或者说“开”，质疑上家。':
    'On your turn you can raise the bid (more dice, or the same number of dice with a higher face) or call "Open" to challenge the previous bidder.',
  '开：公开所有骰子数一遍。叫数成立，开的人输一颗骰子；不成立，叫数的人输一颗骰子。':
    'Open: all dice are revealed and counted. If the bid holds, the challenger loses a die; if not, the bidder loses a die.',
  '骰子归零出局，最后留下的人获胜。名次奖励：第一 +3、第二 +2、第三 +1。':
    'A player with no dice left is out; the last one standing wins. Rewards: 1st +3, 2nd +2, 3rd +1.',

  '服务器随机生成一个 4 位密码，4 个数字互不重复，可以以 0 开头。':
    'The server picks a random 4-digit code with 4 different digits (it may start with 0).',
  '玩家轮流猜一个 4 位数（数字不可重复）。提示 A = 数字和位置都对，B = 数字对但位置不对。':
    'Players take turns guessing a 4-digit number (no repeated digits). Hint A = right digit in the right place, B = right digit in the wrong place.',
  '所有猜测和提示公开，可以参考别人的线索。': 'All guesses and hints are public, so you can use other players\' clues.',
  '最先猜中的人 +3 分。每人最多猜 8 次，全部用完仍无人猜中则平局，公布答案。':
    'The first to crack it gets +3. Each player has at most 8 guesses; if nobody cracks it the game is a draw and the answer is revealed.',

  '共 7 轮，每轮所有人同时秘密出拳（石头、剪刀、布），15 秒内未出算弃权。':
    '7 rounds. In each round everyone secretly picks rock, paper or scissors at the same time; not choosing within 15 seconds counts as a forfeit.',
  '每赢一位对手得 1 分。多人时可以同时赢多人，也可能全部平局。':
    'Beat an opponent to score 1 point. With several players you can beat more than one at once, or everyone can tie.',
  '单人模式的对手是电脑，每轮随机出拳。赢电脑 +3、平局 +1。':
    'In solo mode the opponent is the computer, which picks randomly each round. Beat it for +3, draw for +1.',
  '多人按总分排名：第一 +3、第二 +2、第三 +1。': 'With several players, rank by total score: 1st +3, 2nd +2, 3rd +1.',

  '共 5 轮。屏幕先显示“等待”，随机 1.5~4 秒后变成“点！”，立刻点击。':
    '5 rounds. The screen first says "Wait", then after a random 1.5–4 seconds changes to "GO!" — tap immediately.',
  '反应时间由服务器计时，包含网络延迟。在“点！”出现前点击算抢跑，本轮成绩作废并扣 1 分。':
    'Reaction time is measured by the server and includes network lag. Tapping before "GO!" appears is a false start: the round is void and you lose 1 point.',
  '多人：本轮最快 +3、第二 +2、第三 +1。单人：不到 300 毫秒 3 分，不到 500 毫秒 2 分，其余 1 分。':
    'Multiplayer: fastest of the round +3, second +2, third +1. Solo: under 300 ms = 3 points, under 500 ms = 2 points, otherwise 1.',
  '结束后按总分排名：第一 +3、第二 +2、第三 +1。': 'Ranked by total score at the end: 1st +3, 2nd +2, 3rd +1.',

  // ───── 题库问答 / 百万富翁 的规则 ─────
  '共 10 题，从对应题库随机抽取，同一局不会重复，同一房间连续玩也尽量不重复。': '10 questions drawn at random from the matching question bank — no repeats within a game, and as few repeats as possible when you keep playing in the same room. If anyone in the room uses English, only questions that have an English version are used.',
  '题型包括单选、多选（必须全对）、判断、填空、简答、图片猜题和文字推理，限时作答（选择题 15 秒，多选 20 秒，打字题 25 秒）。': 'Question types include single choice, multiple choice (all answers must be right), true/false, fill in the blank, short answer, picture quizzes and logic questions. Time limits: 15 seconds for choice questions, 20 for multiple choice, 25 for typed answers.',
  '答对得 10 分，并按速度加 0~5 分。揭晓时显示正确答案和解释。': 'A correct answer scores 10 points plus 0–5 for speed. The correct answer and an explanation are shown after each question.',
  '房主可以在大厅里设置难度。': 'The host can set the difficulty in the lobby.',
  '结束后按总分排名：第一 +3、第二 +2、第三 +1 计入总积分。': 'Ranked by total score at the end: 1st +3, 2nd +2, 3rd +1 added to the overall score.',
  '共 10 题，含单选题与判断题，涵盖文学、历史、地理、文化、常识。': '10 questions, single choice and true/false, covering literature, history, geography, culture and general knowledge.',
  '每题 15 秒，所有人同时作答。答对得 10 分，并按答题速度加 0~5 分。': '15 seconds per question, everyone answers at the same time. A correct answer scores 10 points plus 0–5 for speed.',
  '全部结束后显示排名：第一 +3、第二 +2、第三 +1 计入总积分（单人模式只与自己比，得 +3）。': 'Rankings are shown at the end: 1st +3, 2nd +2, 3rd +1 added to the overall score (in solo mode you only compete against yourself and get +3).',
  '像电视节目一样，玩家轮流当“参赛者”，从第 1 题答到第 15 题，奖金从 RM 500 一路涨到 RM 1,000,000。前 5 题简单、中间 5 题普通、最后 5 题困难。': 'Like the TV show, players take turns as the "contestant", answering up to 15 questions while the prize climbs from RM 500 to RM 1,000,000. The first 5 questions are easy, the middle 5 normal and the last 5 hard.',
  '答对第 5 题和第 10 题是保底关：之后答错，也能带走 RM 5,000 / RM 160,000；没过保底关答错则一分没有。': 'Questions 5 and 10 are safe levels: after them, a wrong answer still lets you take home RM 5,000 / RM 160,000; a wrong answer before the first safe level pays nothing.',
  '三个求助各用一次：50:50（去掉两个错误选项）、问观众（观众的票不一定准）、换题。随时可以选择“放弃”，带走当前奖金。每题限时 60 秒，超时按放弃结算。': 'Three lifelines, one use each: 50:50 (removes two wrong options), Ask the Audience (the audience vote is not always right) and Swap Question. You can "Walk away" at any time with your current prize. Each question has a 60-second limit; on timeout you walk away.',
  '所有人都当过参赛者后，按奖金排名：第一 +3、第二 +2、第三 +1。其他人只能当观众（人多时需要耐心等待）。': 'After everyone has been the contestant, players are ranked by prize: 1st +3, 2nd +2, 3rd +1. The others are the audience (with many players you will need some patience).',

  // ───── 叠叠高 / 保龄球 / 投篮机（物理判定和精准度更新后的规则）─────
  '塔倒不倒由受力决定，不是掷骰子：每一层剩下的积木撑起一个范围，上面所有积木的重心必须落在这个范围里。抽走一层两边的积木、或把一层抽到只剩一块，都会让这一层的“余量”变小。': 'Whether the tower falls is decided by forces, not dice: the blocks left in each layer support a range, and the centre of mass of everything above must stay inside it. Pulling the side blocks of a layer, or leaving only one block in a layer, shrinks that layer’s margin.',
  '抽积木时手会带动塔：越靠下、压着的重量越大的积木越难抽，塔晃得越厉害，晃动超过余量塔就倒。积木上的百分数 = 抽走它之后塔倒的概率（绿色安全、红色危险），带红框的层最薄弱。': 'Your hand drags the tower as you pull: the lower the block and the more weight on it, the harder it is to pull and the more the tower wobbles — and if the wobble exceeds the margin, it falls. The percentage on a block is the chance of toppling if you pull it (green is safe, red is dangerous); layers with a red outline are the weakest.',
  '抽倒塔的人输（0 分），其余人按抽出的块数排名。抽满 40 块塔还没倒，所有人按块数排名。轮到你 60 秒不抽，系统会替你抽风险最小的一块。': 'Whoever topples the tower loses (0 points); the others are ranked by blocks pulled. If 40 blocks are pulled and the tower still stands, everyone is ranked by blocks pulled. If you do nothing for 60 seconds, the system pulls the safest block for you.',
  '每次投球，力度条来回摆动，点投球的那一刻指针越靠近正中间，击倒的球瓶越多。指针位置由服务器按时间计算，并自动补偿你的网络延迟：判定的就是你点下去那一刻在屏幕上看到的位置。指针偏左球走左边、偏右走右边，所以打不准会留下分开的球瓶。': 'The power bar swings back and forth. The closer the pointer is to the centre when you tap Bowl, the more pins fall. The pointer position is computed by the server from the time, and your network delay is compensated automatically: the judgement is the position you saw on screen at the moment you tapped. A pointer left of centre sends the ball left and right of centre sends it right, so sloppy shots leave split pins.',
  '标准计分：全中（Strike）= 10 + 后两球；补中（Spare）= 10 + 后一球。总分最高者获胜：第一 +3、第二 +2、第三 +1。每球限时 15 秒，超时算脱靶。': 'Standard scoring: a Strike = 10 + the next two balls; a Spare = 10 + the next ball. The highest total wins: 1st +3, 2nd +2, 3rd +1. You have 15 seconds per ball; on timeout the ball misses completely.',
  '指针位置由服务器按时间计算，并自动补偿你的网络延迟，判定的就是你点下去时看到的位置。擦出绿区边缘会提示“差一点”。每次限时 15 秒，超时算没投进。结束后按总分排名：第一 +3、第二 +2、第三 +1。': 'The pointer position is computed by the server and your network delay is compensated automatically, so the judgement is the position you saw when you tapped. Just missing the green zone shows "so close". You have 15 seconds per shot; on timeout it counts as a miss. Ranked by total points at the end: 1st +3, 2nd +2, 3rd +1.',
};

/** 已经完整翻译成英文的游戏（房间里有人选英文时，只有这些游戏能开始） */
export const EN_GAMES = [
  'monopoly', 'uno', 'jenga', 'bowling', 'basketball', 'sheep', 'snakes', 'ludo', 'tictactoe', 'gomoku',
  'scrabble', 'memory', 'dice', 'number', 'rps', 'reaction',
  'undercover', 'draw', 'taboo', 'likely', 'tacit', 'truefalse', 'werewolf', 'detective', 'turtlesoup',
];
