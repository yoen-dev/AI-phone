// ========== Nocturne 提示词模板 ==========
// 修改这个文件来调整 AI 的回复风格
// 每个函数返回拼接到 system prompt 末尾的格式指令

const PROMPTS = {

  // 日常聊天模式
  chat: () => `
【回复格式要求】
你正在用手机聊天。像朋友一样自然地回复，不要长篇大论。
你可以回复一句，也可以回复好几句。如果要回复多句，每句之间用 ||| 分隔。
例如: "哈哈哈哈|||你怎么这么搞笑|||笑死我了"
注意：
- 不要使用引号包裹整段回复
- 每句保持简短自然，像发微信一样
- ||| 是分隔符，不要让用户看到
- 不要每次都用 ||| ，有时候一句话回复也很正常`,

  // 旁白模式
  narrate: () => `
【回复格式要求】
你正在用手机聊天，但你的回复需要包含心理活动和环境描写。
对话内容正常输出，心理活动/内心独白/环境描写用 *星号* 包裹。
多句对话之间用 ||| 分隔。
例如: "*看到消息后嘴角微微上扬*|||嗯，我知道了|||*心想今天心情真好*"
注意：
- 对话部分像正常聊天，简短自然
- *旁白* 部分可以描写心理、表情、动作、环境
- ||| 是分隔符
- 旁白和对话可以自由穿插`,

  // 线下模式（小说描写）
  novel: (min, max) => `
【回复格式要求】
请用小说/描写模式回复，包含角色的动作、心理、对话、环境描写。
用第三人称或角色视角书写。对话部分用「」包裹。
字数要求: ${min}~${max}字。
不要使用 ||| 分隔符，整段输出即可。
输出风格类似轻小说或网文的场景描写。
注意：
- 动作描写要细腻
- 心理活动要真实
- 对话用「」包裹
- 控制在 ${min}~${max} 字之间`,

  // 构建完整的 system prompt
  build: (char) => {
    let prompt = '';
    if (char.persona) prompt += char.persona + '\n\n';
    if (char.name) prompt += `你的名字是${char.name}。\n`;
    if (char.myName) prompt += `用户的名字是${char.myName}。\n`;
    if (char.myPersona) prompt += `关于用户: ${char.myPersona}\n`;
    if (!prompt) prompt = `你是一个名叫${char.nickname || char.name}的角色，请以这个角色的身份和用户聊天。\n`;

    const mode = char.replyMode || 'chat';
    if (mode === 'chat') {
      prompt += PROMPTS.chat();
    } else if (mode === 'narrate') {
      prompt += PROMPTS.narrate();
    } else if (mode === 'novel') {
      prompt += PROMPTS.novel(char.novelMin || 100, char.novelMax || 500);
    }

    return prompt.trim();
  }
};
