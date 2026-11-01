// 词语 / 推理类游戏的规则文字
export const RULES: Record<string, string> = {
  // 谁是卧底
  '1 名卧底、2 名平民。平民拿到词 A，卧底拿到相近的词 B，没人知道自己是不是卧底。': '1 undercover and 2 civilians. The civilians get word A and the undercover gets a similar word B; nobody knows whether they are the undercover.',
  '每人依次用一句话描述自己的词（不能直接说出原词），然后自由讨论。': 'Each player in turn describes their word in one sentence (without saying the word itself), then you discuss freely.',
  '同时投票，得票最多者出局。投中卧底则平民胜；投错或平票则进行第二轮，仍未找出卧底则卧底胜。': 'Everyone votes at the same time and the player with the most votes is out. If the undercover is caught the civilians win; on a wrong vote or a tie there is a second round, and if the undercover is still not found they win.',
  '积分：平民胜各 +2，卧底胜卧底 +4。': 'Points: civilians +2 each if they win; the undercover +4 if they win.',

  // 你画我猜
  '大家轮流担任画家，每人画好几次（2 人各 3 次、3~5 人各 2 次、6 人以上各 1 次，共 6~10 回合），画家只能看到题目。': 'Players take turns as the drawer, several times each (2 players: 3 times each; 3–5 players: 2 times each; 6 or more: once each — 6 to 10 rounds in total). Only the drawer sees the word.',
  '画板支持画笔、橡皮、颜色、清空，画面实时同步给其他玩家。': 'The canvas has a pen, eraser, colours and clear; the drawing is shown live to the other players.',
  '猜词者在 60 秒内输入答案，越早猜对得分越高（3~1 分），画家每有人猜对 +1 分。': 'Guessers have 60 seconds to type the answer — the earlier you guess right, the more you score (3–1 points) — and the drawer gets +1 for every correct guess. In a mixed-language room, the word in either language counts as correct.',

  // 狼人杀
  '身份：狼人 1 人、预言家 1 人、守卫 1 人，每人只知道自己的身份。': 'Roles: 1 werewolf, 1 seer and 1 guard; everyone knows only their own role.',
  '夜晚：狼人咬人，预言家验人，守卫守人，同时行动。首夜狼人不能咬人。': 'Night: the werewolf bites, the seer checks a player and the guard protects a player, all at the same time. The werewolf cannot bite on the first night.',
  '白天：公布死讯，存活者依次发言，然后投票放逐一人。': 'Day: the deaths are announced, the survivors speak in turn, then everyone votes to banish one player.',
  '胜负：狼人被放逐则好人胜；好人只剩 1 人时狼人胜；3 个昼夜仍无结果则狼人胜。': 'Winning: if the werewolf is banished the good players win; if only 1 good player is left the werewolf wins; if there is no result after 3 days and nights the werewolf wins.',

  // 海龟汤
  '一人担任主持人（每局轮换），其余玩家推理（双人时 1 人主持、1 人推理）。主持人可从题库选题或自己输入汤面与汤底。': 'One player is the host (rotating each game) and the others deduce (with two players: 1 host, 1 guesser). The host can pick a puzzle from the bank or type their own puzzle and solution.',
  '推理者只能问是非题，主持人回答“是 / 不是 / 无关”。': 'Guessers can only ask yes/no questions; the host answers "Yes / No / Irrelevant".',
  '推理者可随时提交答案，猜中者 +3，主持人 +1。': 'Guessers can submit an answer at any time; whoever guesses right gets +3 and the host +1.',

  // 侦探推理
  '三人面对同一案件：背景、嫌疑人关系、分散在各地点的线索。': 'The three of you face the same case: the background, how the suspects are related, and clues scattered around different locations.',
  '每轮每人有 2 次搜证行动，可选择公开或私藏线索。': 'Each round every player has 2 investigation actions and can choose to share or keep the clues they find.',
  '合作模式：线索共享，共同提交答案；竞争模式：线索私有，各自提交凶手与动机。': 'Co-op mode: clues are shared and you submit an answer together. Competitive mode: clues are private and everyone submits their own culprit and motive.',
  '凶手猜对 +4，动机猜对 +2。': 'Naming the culprit correctly gives +4, the motive +2.',

  // 谁最有可能
  '共 8 轮，每轮一个问题，例如“谁最有可能迟到？”。每人同时秘密投给一位其他玩家（不能投自己），25 秒内未投算弃权。': '8 rounds, one question per round, e.g. "Who is most likely to be late?". Everyone secretly votes for another player at the same time (not yourself); not voting within 25 seconds counts as abstaining.',
  '全部投完后公开每个人的选择。得票最多的人当选（并列则都算）。': 'After everyone has voted, all choices are revealed. The player with the most votes is chosen (ties all count).',
  '投给了当选者的人各得 1 分——猜对大家怎么想，就是得分关键。': 'Everyone who voted for the chosen player scores 1 point — guessing what the group thinks is the key to scoring.',

  // 默契大考验
  '共 8 轮，每轮一道选择题（没有标准答案），每人同时秘密选一个选项。': '8 rounds. Each round has a multiple-choice question with no right answer, and everyone secretly picks an option at the same time.',
  '揭晓后，每有 1 位其他玩家和你选得一样，你就得 1 分。三人全部一致每人得 2 分。': 'After the reveal, you score 1 point for every other player who picked the same option as you. If all three of you match, everyone gets 2 points.',

  // 真假判断
  '共 10 条陈述，涵盖常识、科学、文学、历史，每条 25 秒内判断“对”或“错”。': '10 statements covering general knowledge, science, literature and history; you have 25 seconds for each to say whether it is true or false.',
  '所有人同时作答，揭晓时显示正确答案和解释。答对得 1 分。': 'Everyone answers at the same time; the correct answer and an explanation are shown at the reveal. A correct answer scores 1 point.',

  // 禁忌词挑战
  '每回合一人当描述者，只有他能看到词语和 3 个禁忌词；其他人看不到，只能靠他的文字描述来猜。': 'Each round one player is the describer, the only one who can see the word and its 3 taboo words; the others cannot see them and must guess from the describer’s written clues.',
  '描述里不能出现词语本身，也不能出现任何一个禁忌词，违规一次扣 1 分，违规 3 次本回合作废（违规的内容不会公开）。': 'The description may not contain the word itself or any of the taboo words. Each violation costs 1 point and 3 violations void the round (violating text is never shown). Both the Chinese and the English form of a word are forbidden.',
  '其他人在输入框里抢答，第一个猜对的人 +3，描述者 +2。每回合限时 60 秒。描述者可以“换词”，扣 1 分。': 'The others race to type the answer; the first correct guesser gets +3 and the describer +2. Each round lasts 60 seconds. The describer may swap the word for a penalty of 1 point.',
  '每人轮流当描述者（双人时各两次）。结束后按总分排名：第一 +3、第二 +2、第三 +1。': 'Everyone takes turns as the describer (twice each with two players). Ranked by total score at the end: 1st +3, 2nd +2, 3rd +1.',
};
