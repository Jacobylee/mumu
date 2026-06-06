# mumu — MVP PRD

## 1. 产品概述

### 产品名称

mumu

### 产品定位

一个强调：

- 英文沉浸式学习
- 长期记忆
- AI驱动查词
- 遗忘曲线复习

的职场英语生词学习 App。

区别于传统背单词 App：

- 默认英文学习
- 中文作为辅助信息
- 强调英文理解能力
- 支持真实语境学习
- 更接近专业 Learner Dictionary

---

## 2. 产品目标

帮助用户：

- 在真实阅读和工作中快速查词
- 长期积累生词
- 基于遗忘曲线自动复习
- 建立英文思维

---

## 3. 目标用户

### 核心用户

- 英语学习者
- 英文阅读用户
- 国际化职场用户

---

## 4. 产品核心原则

### 原则一：极简交互

减少：

- 非必要步骤
- 多余页面
- 复杂操作

用户核心动作只有：

- 查词
- 添加生词
- 复习

---

### 原则二：英文优先

默认：

- 英文释义
- 英文例句

中文：

- 默认隐藏
- 用户主动点击展开

目标：

- 避免依赖中文翻译
- 提升英文理解能力

---

### 原则三：长期记忆

系统自动完成：

- 复习计划
- 提醒
- 遗忘曲线管理

降低用户负担。

---

## 5. MVP 核心功能

### 功能一：查词

#### 用户故事

用户在阅读、学习、工作中遇到陌生英文单词或短语，希望快速理解。

---

#### 功能描述

用户输入英文单词或短语后，系统实时调用 LLM 返回结果。

支持输入：

- 单个英文单词（如 obscure）
- 英文短语（如 take into account）

词形变体规则：

- run / running / ran 视为**不同词条**，各自独立查询和存储
- 不做词形还原

---

#### 系统返回内容

- 单词
- 英式音标（点击播放英式发音）
- 美式音标（点击播放美式发音）
- 使用场景标签
- 常用搭配
- 多个词义（含英文释义、中文释义、英文例句、中文例句）

> 发音来源：使用系统 TTS（Text-to-Speech）引擎，无需额外 API 调用。

---

#### 页面顶部信息

展示：

- 单词
- 英式音标 UK /əbˈskjʊə(r)/ （点击播放英式发音）
- 美式音标 US /əbˈskjʊr/ （点击播放美式发音）

音标交互：

- 点击英式音标 → 播放英式发音
- 点击美式音标 → 播放美式发音
- 发音播放中音标高亮提示

---

#### 使用场景标签

用于提示这个词更偏：

- 书面语
- 口语

可能情况：

| 类型 | 标签 |
|------|------|
| 正式表达 | 书面语 |
| 日常交流 | 口语 |
| 两者都适用 | 书面语 + 口语 |

---

#### 常用搭配

展示：

- 高频 Collocations
- 固定搭配
- 常见短语

示例：

**mitigate**

- mitigate risk
- mitigate damage
- mitigate impact

---

#### 多词义结构（核心）

每个词义独立展示：

- 英文释义
- 中文释义
- 英文例句
- 中文例句

例句必须和对应词义绑定。

---

#### 默认展示（英文优先）

默认仅展示：

- 英文释义
- 英文例句

默认隐藏：

- 中文释义
- 中文例句

---

#### 中文展开逻辑

页面提供：

「中文释义」

点击后在每个英文（单词英文解释 & 例句）下方展开对应的：

- 中文释义

再次点击：

- 收起中文

---

#### 页面结构示例

**obscure**

UK /əbˈskjʊə(r)/ | US /əbˈskjʊr/

[书面语]

**Common Collocations**

- obscure meaning
- obscure reference

**Meaning 1**

English Meaning:
not discovered or known about

Example:
The origins of the ritual remain obscure.

**Meaning 2**

English Meaning:
difficult to understand

Example:
The article uses obscure language.

[中文释义]

[加入生词本]

---

#### 用户流程

1. 用户输入单词或短语
2. 点击搜索
3. 系统实时调用 LLM，返回英文释义
4. 用户可展开中文
5. 用户可加入生词本

---

#### 异常处理

| 场景 | 处理方式 |
|------|----------|
| 查不到的词 / 不存在的词 | 显示「该词不存在」 |
| LLM 返回格式异常 | 自动重试1次，仍失败则显示「查询失败，请重试」 |
| 网络错误 | 显示「网络连接失败」 |
| LLM 超时 | 显示「查询超时，请重试」 |

---

### 功能二：添加生词

#### 用户故事

用户希望把单词保存到长期学习列表。

---

#### 功能描述

查词结果页提供：

「加入生词本」

点击后：

- 保存单词
- 记录添加时间
- 自动生成复习计划（next_review_at = 当前时间 + intervals[0]）

重复添加：若该单词已在生词本中，提示「该词已在生词本中」，不重复添加。

---

#### 用户流程

1. 用户查词
2. 点击加入生词本
3. 系统提示添加成功（或提示已存在）

---

### 功能三：首页 Dashboard

#### 页面目标

让用户快速知道：

- 今日学习进度
- 今日剩余任务
- 当前词汇积累情况

---

#### 页面内容

**1. 今日复习进度**

展示：

10 / 20

含义：

- 今日需复习20个
- 已完成10个

---

**2. 今日待复习列表**

| 单词 | 剩余复习次数 |
|------|--------------|
| obscure | 3次 |
| concise | 1次 |

---

**3. 已掌握单词数**

示例：

已掌握 128 个单词

---

**4. 搜索框**

首页顶部提供：

- 单词搜索框

方便快速查词。

---

### 功能四：生词本

#### 用户故事

用户希望查看历史保存的所有单词。

---

#### 功能描述

展示：

- 单词
- 下次复习时间
- 剩余复习次数

---

#### 页面示例

| 单词 | 下次复习 | 剩余次数 |
|------|----------|----------|
| obscure | 今天20:00 | 3 |
| mitigate | 明天 | 4 |

---

#### 页面交互

支持：

- 点击查看详情
- 进入复习

---

### 功能五：遗忘曲线复习

#### 用户故事

用户希望系统自动安排复习时间。

---

#### 复习间隔配置

复习间隔由开发者在系统配置中设定，支持自定义。

默认值（从添加日算起的绝对天数）：

| 轮次 | 从添加日算起 | 间隔（从上次复习算起） |
|------|-------------|----------------------|
| 第1轮 | 第2天 | 2天 |
| 第2轮 | 第4天 | 2天 |
| 第3轮 | 第7天 | 3天 |
| 第4轮 | 第15天 | 8天 |
| 第5轮 | 第30天 | 15天 |

存储于 `SystemConfig` 表，key = `review_intervals`，value = `[2, 2, 3, 8, 15]`。

用户侧页面展示的复习计划读取此配置，如开发者修改为 `[1, 2, 5, 10, 20]`，则用户看到的间隔也会相应变化。

**间隔变更规则**：复习间隔轻易不修改。若修改，对已存在的 UserWord 处理逻辑：

- 若 `current_interval_index < 新 intervals.length`：正常使用新间隔
- 若 `current_interval_index >= 新 intervals.length`：使用新 intervals 的最后一个值，`review_remaining_count` 调整为 `新 intervals.length - 已完成轮次`

---

#### 复习间隔计算规则

**核心原则：间隔从上一次复习日期算起，不是从添加日期算起。**

计算公式：

```
next_review_at = 当前复习完成时间 + intervals[current_interval_index]
```

示例（默认间隔 [2, 2, 3, 8, 15]）：

| 事件 | current_interval_index | next_review_at |
|------|------------------------|----------------|
| 添加单词 | 0 | now + 2天 |
| 第1次复习完成（认识） | 1 | now + 2天 |
| 第2次复习完成（认识） | 2 | now + 3天 |
| 第3次复习完成（认识） | 3 | now + 8天 |
| 第4次复习完成（认识） | 4 | now + 15天 |
| 第5次复习完成（认识） | — | 标记为已掌握 |

---

#### 复习状态逻辑

**新单词**

- review_remaining_count = intervals.length（默认5）
- current_interval_index = 0

**点击「认识」**

- current_interval_index += 1
- review_remaining_count -= 1
- next_review_at = now + intervals[current_interval_index]
- 记录 ReviewLog（result = "known"）

**点击「不认识」**

- 当次复习视为无效
- current_interval_index 重置为 0
- review_remaining_count 不变（当次不算进度）
- next_review_at = now + intervals[0]（即重新从第1轮开始）
- 记录 ReviewLog（result = "unknown"）

**完成全部复习**

- review_remaining_count = 0
- mastered = true

---

#### 漏复习处理

用户未在当天完成复习时：

- 所有 next_review_at <= 当前时间的单词持续累积
- 不会因未复习而跳过或删除
- 次日及之后仍会出现在待复习列表中
- 推送提醒持续触发，直到用户完成

---

#### 复习触发逻辑

系统每日当地时间 12:00 检查：

是否存在：

- next_review_at <= 当前时间

若存在：

- 加入今日复习列表
- 推送提醒

---

### 功能六：复习页面

#### 用户故事

用户希望快速完成每日复习。

---

#### 复习流程（核心交互）

复习采用**两步式**交互：

**第一步：只展示单词**

页面中央仅显示：

- 单词（大字）
- 英式音标 / 美式音标（点击可播放发音）

若用户开启了「复习自动发音」设置，则展示新单词时自动播放美式发音一次。

底部两个按钮：

- 不认识
- 认识

顶部撤回区域（条件显示）：

- 若上一个词用户点击了「认识」，则显示撤回提示条：`刚才标记了「xxx」为认识 [撤回]`
- 点击「撤回」后，跳转到上一个词的详情页，进入撤回模式

---

**第二步 A：点击「认识」**

- 记录 ReviewLog（result = "known"）
- current_interval_index += 1
- review_remaining_count -= 1
- next_review_at = now + intervals[current_interval_index]
- 自动展示下一个词（回到第一步）
- 顶部出现撤回提示条

**第二步 B：点击「不认识」**

- 展示单词完整详情（释义、例句、搭配、标签）
- 页面底部按钮变为「下一个」
- 点击「下一个」后：
  - 记录 ReviewLog（result = "unknown"）
  - current_interval_index 重置为 0
  - review_remaining_count 不变
  - next_review_at = now + intervals[0]
  - 自动展示下一个词（回到第一步）

---

**撤回流程**

用户点击撤回提示条后：

- 跳转到上一个词的详情页
- 顶部显示提示：`你之前标记了「认识」，确认要撤回吗？`
- 底部两个按钮：
  - **仍然认识**：保持「认识」结果不变，返回当前复习词
  - **撤回为不认识**：
    - 删除上一条 ReviewLog（result = "known"）
    - 新增 ReviewLog（result = "unknown"）
    - current_interval_index 重置为 0
    - review_remaining_count 恢复（+1）
    - next_review_at = now + intervals[0]
    - 返回当前复习词

撤回限制：仅支持撤回上一个词，不可连续撤回多个。

---

**所有词复习完成**

- 提示「当日复习任务已完成」
- 进入复习完成页

---

#### 单词详情展开后的展示内容

- 单词
- 英文释义
- 英文例句
- 使用标签
- 常用搭配

默认隐藏：

- 中文释义
- 中文例句

提供「查看中文」按钮，点击后展开中文释义和中文例句。

---

#### 页面流程

1. 用户进入复习
2. 页面中央仅展示单词 + 音标
3. 用户判断是否认识
4a. 认识 → 点击「认识」→ 自动进入下一词（顶部出现撤回提示）
4b. 不认识 → 点击「不认识」→ 展示完整详情 → 点击「下一个」→ 进入下一词
5. 撤回 → 点击撤回提示 → 查看上一个词详情 → 选择「仍然认识」或「撤回为不认识」→ 返回当前词
6. 所有词完成 → 提示当日复习任务已完成 → 进入复习完成页

---

### 功能七：发音设置

#### 用户故事

用户希望控制复习时是否自动播放单词发音，以及主动点击音标听发音。

---

#### 发音功能

- 所有展示音标的页面（单词详情页、复习页面、搜索结果页），点击音标均可播放对应发音
- 点击英式音标 → 播放英式发音
- 点击美式音标 → 播放美式发音
- 发音播放中，音标文字高亮提示
- 发音来源：系统 TTS 引擎，根据单词文本合成，无需额外 API

---

#### 自动发音设置

入口：「我的」→「复习自动发音」

| 设置项 | 说明 |
|--------|------|
| 复习自动发音 | 开关，默认开启 |

- 开启：复习时每次展示新单词，自动播放美式发音一次
- 关闭：复习时不自动发音，仅点击音标时播放

---

#### 设置存储

- 存储于 `User.settings.auto_pronounce_on_review` 字段
- 默认值：true（开启）
- 修改后即时生效

---

## 6. 页面结构

> 页面导航结构（底部 Tab 栏、页面跳转关系）待设计稿确认后补充。

### 页面一：首页

包含：

- 搜索框
- 今日复习进度
- 今日待复习列表
- 已掌握数量

---

### 页面二：搜索结果页

包含：

- 搜索结果列表
- 单词简要释义

---

### 页面三：单词详情页

包含：

- 单词
- 英式音标（点击发音）/ 美式音标（点击发音）
- 标签
- 常用搭配
- 多词义
- 英文例句
- 中文展开
- 加入生词本

---

### 页面四：生词本

包含：

- 生词列表
- 剩余复习次数
- 下次复习时间

---

### 页面五：复习页面

包含：

- 单词（大字）
- 英式音标（点击发音）/ 美式音标（点击发音）
- 英文释义
- 英文例句
- 中文展开
- 认识 / 不认识按钮

---

### 页面六：复习完成页

包含：

- 今日完成情况
- 正确率
- 连续学习天数

---

### 页面七：登录页

包含：

- 用户名输入框
- 密码输入框
- 登录按钮

---

### 页面八：我的

包含：

- 用户名
- 已掌握单词数（点击进入已掌握列表页）
- 复习自动发音（开关）
- 复习间隔说明（点击进入间隔说明页）
- 退出登录

---

### 页面九：已掌握单词列表

包含：

- 掌握总数
- 已掌握单词列表（仅展示单词，标签显示"已掌握"）

---

### 页面十：复习间隔说明页

包含：

- 复习间隔说明文字
- 各轮次间隔天数（从 SystemConfig 读取）
- 「不认识」规则的简要说明

---

## 7. 空状态与异常状态

| 页面 | 场景 | 展示内容 |
|------|------|----------|
| 首页 | 今日无待复习 | 「真棒！已经完成了所有复习内容」 |
| 生词本 | 无单词 | 「快去收集陌生词汇吧」 |
| 搜索 | 无结果 / 词不存在 | 提示无结果 |
| 复习 | 无待复习 | 「暂时没有可复习的词汇」 |
| 全局 | 网络断开 | 「当前网络不佳，请稍后重试」 |
| 全局 | 加载中 | 呼吸态动画 |

---

## 8. 数据结构

> 所有 id 字段使用 UUID v4。所有时间字段使用 ISO 8601 格式，存储 UTC 时间。

### User

```json
{
  "id": "uuid",
  "username": "string，唯一",
  "password_hash": "string，bcrypt 哈希",
  "created_at": "ISO 8601",
  "settings": {
    "auto_pronounce_on_review": true
  }
}
```

说明：

- 账号由开发者线下分配，无注册功能
- 密码以 bcrypt 哈希存储，不在任何接口中明文返回
- `settings.auto_pronounce_on_review`：复习时是否自动发音，默认 true

---

### Word

```json
{
  "id": "uuid",
  "word": "obscure",
  "phonetic_uk": "/əbˈskjʊə(r)/",
  "phonetic_us": "/əbˈskjʊr/",
  "usage_tags": [
    "written"
  ],
  "collocations": [
    "obscure meaning",
    "obscure reference"
  ],
  "meanings": [
    {
      "meaning_en": "not discovered or known about",
      "meaning_cn": "未知的；不明确的",
      "example_en": "The origins of the ritual remain obscure.",
      "example_cn": "这个仪式的起源仍然未知。"
    },
    {
      "meaning_en": "difficult to understand",
      "meaning_cn": "晦涩难懂的",
      "example_en": "The article uses obscure language.",
      "example_cn": "这篇文章用了晦涩的语言。"
    }
  ]
}
```

---

### UserWord

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "word_id": "uuid",
  "added_at": "ISO 8601",
  "next_review_at": "ISO 8601",
  "current_interval_index": 0,
  "review_remaining_count": 5,
  "mastered": false
}
```

字段说明：

- `current_interval_index`：当前处于第几轮复习（0-based），对应 intervals 数组的下标
- `review_remaining_count`：剩余复习次数，初始值 = intervals.length
- `mastered`：全部复习完成后标记为 true

---

### ReviewLog

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "word_id": "uuid",
  "reviewed_at": "ISO 8601",
  "result": "known | unknown"
}
```

说明：

- 记录每次复习的结果
- 用于计算正确率和学习统计

---

### SystemConfig

```json
{
  "id": "uuid",
  "key": "review_intervals",
  "value": [2, 2, 3, 8, 15],
  "updated_at": "ISO 8601"
}
```

说明：

- 开发者可配置的系统参数
- `review_intervals`：复习间隔天数数组，修改后立即生效
- 用户侧页面展示的复习计划读取此配置

---

## 9. AI 查词接口

### LLM 调用方式

- 每次用户输入均实时调用 LLM（Qwen）
- 暂不做查询缓存

### LLM Prompt 模板

```
You are a professional English dictionary assistant. Given an English word or phrase, return a JSON object with the following structure:

{
  "word": "the input word or phrase",
  "phonetic_uk": "UK IPA transcription",
  "phonetic_us": "US IPA transcription",
  "usage_tags": ["written" and/or "spoken"],
  "collocations": ["common collocation 1", "common collocation 2", "common collocation 3"],
  "meanings": [
    {
      "meaning_en": "English definition in simple, clear language",
      "meaning_cn": "简洁准确的中文释义",
      "example_en": "A natural English example sentence using this meaning",
      "example_cn": "例句的中文翻译"
    }
  ]
}

Rules:
1. Provide 2-4 most common meanings, ordered by frequency of use
2. Prioritize workplace and professional contexts for examples when applicable
3. collocations: provide 2-4 high-frequency and practical collocations for the word
4. meaning_en: use clear, concise definitions similar to learner dictionaries (e.g., Oxford Learner's Dictionary style)
5. meaning_cn: accurate and natural Chinese translation
6. example_en: natural, complete sentences that clearly demonstrate the meaning in context
7. example_cn: accurate Chinese translation of the example sentence
8. usage_tags: must include at least one of "written" or "spoken"; include both if the word is common in both contexts
9. If the input is not a valid English word or phrase, return: {"error": "not_found"}
10. Return ONLY valid JSON, no additional text or markdown formatting
```

### LLM 返回格式

正常返回：

```json
{
  "word": "obscure",
  "phonetic_uk": "/əbˈskjʊə(r)/",
  "phonetic_us": "/əbˈskjʊr/",
  "usage_tags": [
    "written"
  ],
  "collocations": [
    "obscure meaning",
    "obscure reference"
  ],
  "meanings": [
    {
      "meaning_en": "not discovered or known about",
      "meaning_cn": "未知的；不明确的",
      "example_en": "The origins of the ritual remain obscure.",
      "example_cn": "这个仪式的起源仍然未知。"
    },
    {
      "meaning_en": "difficult to understand",
      "meaning_cn": "晦涩难懂的",
      "example_en": "The article uses obscure language.",
      "example_cn": "这篇文章用了晦涩的语言。"
    }
  ]
}
```

词不存在时：

```json
{
  "error": "not_found"
}
```

---

## 10. 用户登录

### 登录方式

- 固定账号密码登录
- 账号由开发者线下分配
- 无注册功能
- 无忘记密码功能

### 登录流程

1. 用户打开 App
2. 若未登录，显示登录页
3. 输入用户名和密码
4. 系统验证
5. 验证通过 → 进入首页
6. 验证失败 → 提示「用户名或密码错误」

### 登录态管理

- 登录成功后签发 JWT Token
- Token 有效期 30 天
- Token 过期后需重新登录
- 本地持久化 Token，App 重启无需重新登录（Token 有效期内）

---

## 11. 通知系统

### 实现方式

- 使用本地通知（Local Notification）
- App 端注册每日定时通知，当地时间 12:00 触发

### 推送逻辑

每日当地时间 12:00 检查：

是否存在待复习单词。

### 推送示例

- 你今天还有20个单词待复习
- 今日学习还未完成

---

## 12. UI 规范

### 界面语言

- 中文

### 深色模式

- 一期不支持

### 视觉风格

- 简约紫
- 品牌主色：紫色系
- 整体风格：极简、干净、留白充足

---

## 13. 开发者配置管理

### 管理方式

- 通过后端管理 API 管理（需管理员 Token 鉴权）
- 不做独立管理页面，使用 curl / Postman 等工具直接调用

### 管理员账号

- 在 `User` 表中新增 `role` 字段，值为 `"admin"` 或 `"user"`
- 管理员账号同样由开发者线下创建

### 管理接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /admin/config | 获取所有系统配置 |
| PUT | /admin/config/:key | 更新指定配置项 |

---

## 14. API 接口定义

### 认证方式

- 除登录接口外，所有请求需在 Header 中携带 `Authorization: Bearer <jwt_token>`
- Token 无效或过期返回 401，前端跳转登录页

### 接口列表

#### 认证

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| POST | /auth/login | 登录 | `{ username, password }` | `{ token, user }` |

#### 查词

| 方法 | 路径 | 说明 | 参数 | 响应 |
|------|------|------|------|------|
| GET | /words/search?q=:query | 搜索单词/短语 | query: 搜索词 | Word 对象 或 `{ error: "not_found" }` |

#### 生词本

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| GET | /user-words | 获取生词本列表 | — | `[ UserWord 含 Word 详情 ]` |
| GET | /user-words?mastered=true | 获取已掌握单词列表 | — | `[ UserWord 含 Word 详情 ]` |
| POST | /user-words | 添加生词 | `{ word_id }` | UserWord 对象 |
| DELETE | /user-words/:id | 从生词本移除 | — | 204 |

#### 单词详情

| 方法 | 路径 | 说明 | 参数 | 响应 |
|------|------|------|------|------|
| GET | /words/:id | 获取单词详情 | — | Word 对象 |

#### 复习

| 方法 | 路径 | 说明 | 参数 | 响应 |
|------|------|------|------|------|
| GET | /reviews/today | 获取今日待复习列表 | — | `[ UserWord 含 Word 详情 ]` |
| POST | /reviews/:userWordId/complete | 完成一次复习 | `{ result: "known" \| "unknown" }` | UserWord 对象 |

#### 首页数据

| 方法 | 路径 | 说明 | 参数 | 响应 |
|------|------|------|------|------|
| GET | /dashboard | 获取首页数据 | — | `{ today_total, today_done, mastered_count, today_reviews }` |

#### 用户设置

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| GET | /user/settings | 获取用户设置 | — | `{ auto_pronounce_on_review }` |
| PUT | /user/settings | 更新用户设置 | `{ auto_pronounce_on_review }` | settings 对象 |

#### 管理员

| 方法 | 路径 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| GET | /admin/config | 获取系统配置 | — | `[ SystemConfig ]` |
| PUT | /admin/config/:key | 更新配置 | `{ value }` | SystemConfig 对象 |
| POST | /admin/users | 创建用户 | `{ username, password }` | User 对象 |

### 响应格式约定

所有接口统一响应结构：

```json
{
  "success": true,
  "data": {},
  "error": ""
}
```

- 成功：`success: true`，`data` 为返回数据
- 失败：`success: false`，`error` 为错误信息

### HTTP 状态码

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 204 | 删除成功（无返回体） |
| 400 | 请求参数错误 |
| 401 | 未认证 / Token 过期 |
| 403 | 无权限（非管理员访问管理接口） |
| 404 | 资源不存在 |
| 409 | 资源冲突（如重复添加生词） |
| 500 | 服务器内部错误 |

---

## 15. 技术栈

| 层级 | 技术选型 |
|------|----------|
| 前端 | React Native |
| 后端 | Node.js |
| 数据库 | PostgreSQL |
| LLM | Qwen |
| 语音 | 系统 TTS 引擎 |

---

## 16. MVP 不包含内容

以下功能不进入 MVP：

- 社交功能
- 排行榜
- AI记忆法
- GPT聊天助手
- 学习报告
- 多设备同步
- Web端
- 用户社区
- AI阅读助手
- 深色模式

---

## 17. MVP 成功标准

用户能够：

- 登录
- 查词
- 添加生词
- 查看生词本
- 收到提醒
- 完成复习

即可视为 MVP 验证成功。
