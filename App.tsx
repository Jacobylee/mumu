import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  type StyleProp,
  type ViewStyle,
  View
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchYoudaoAudio } from './src/lib/youdaoTts';
import { formatRelativeReviewTime, searchWord } from './src/lib/dictionary';
import type { SearchOutcome } from './src/lib/dictionary';
import { chatWithQwen, translateMeaningsToChinese, type ChatMessage } from './src/lib/qwen';
import { completeReview, createUserWord, isDue } from './src/lib/review';
import {
  loadAll,
  saveChatHistory,
  saveCnTranslations,
  saveDailyStats,
  saveQwenApiKey,
  saveReviewLogs,
  saveSettings,
  saveUserWords,
  todayKey,
  type ChatHistoryMap,
  type CnTranslationMap
} from './src/lib/storage';
import { initialUserWords, reviewIntervals, words } from './src/mockData';
import { colors } from './src/theme';
import { AppSettings, ReviewLog, ScreenName, UserWord, Word } from './src/types';

type TabName = 'home' | 'book' | 'my';
type BookFilter = 'unmastered' | 'mastered';
type BookSort = 'recent' | 'alpha';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<ScreenName>('home');
  const [activeTab, setActiveTab] = useState<TabName>('home');
  const [history, setHistory] = useState<ScreenName[]>([]);
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [searchResult, setSearchResult] = useState<Word | null>(null);
  const [searchError, setSearchError] = useState('');
  const [userWords, setUserWords] = useState<UserWord[]>(initialUserWords);
  const [reviewLogs, setReviewLogs] = useState<ReviewLog[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ autoPronounceOnReview: true });
  const [showChinese, setShowChinese] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<UserWord[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewDetailMode, setReviewDetailMode] = useState<'unknown' | 'undo'>('unknown');
  const [previousKnown, setPreviousKnown] = useState<{ userWord: UserWord; before: UserWord; logId: string } | null>(null);
  const [completedToday, setCompletedToday] = useState(0);
  const [knownToday, setKnownToday] = useState(0);
  const [qwenApiKey, setQwenApiKey] = useState('');
  const [hydrated, setHydrated] = useState(false);
    const [bookFilter, setBookFilter] = useState<BookFilter>('unmastered');
    const [bookSort, setBookSort] = useState<BookSort>('recent');
  const [aiTargetWord, setAiTargetWord] = useState<Word | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistoryMap>({});
  const [cnTranslations, setCnTranslations] = useState<CnTranslationMap>({});
  const [translatingCn, setTranslatingCn] = useState(false);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    return () => {
      audioPlayerRef.current?.remove();
      audioPlayerRef.current = null;
    };
  }, []);

  // 启动时一次性加载持久化数据；跨天会自动重置今日统计。
  useEffect(() => {
    let cancelled = false;
    loadAll()
      .then(state => {
        if (cancelled) return;
        setUserWords(state.userWords);
        setReviewLogs(state.reviewLogs);
        setSettings(state.settings);
        setCompletedToday(state.dailyStats.completed);
        setKnownToday(state.dailyStats.known);
        setQwenApiKey(state.qwenApiKey);
        setChatHistory(state.chatHistory);
        setCnTranslations(state.cnTranslations);
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // hydrate 完成后，任意业务状态变更都会自动写回。
  useEffect(() => {
    if (hydrated) saveUserWords(userWords);
  }, [hydrated, userWords]);
  useEffect(() => {
    if (hydrated) saveReviewLogs(reviewLogs);
  }, [hydrated, reviewLogs]);
  useEffect(() => {
    if (hydrated) saveSettings(settings);
  }, [hydrated, settings]);
  useEffect(() => {
    if (!hydrated) return;
    saveDailyStats({ date: todayKey(), completed: completedToday, known: knownToday });
  }, [hydrated, completedToday, knownToday]);
  useEffect(() => {
    if (hydrated) saveQwenApiKey(qwenApiKey);
  }, [hydrated, qwenApiKey]);
  useEffect(() => {
    if (hydrated) saveChatHistory(chatHistory);
  }, [hydrated, chatHistory]);
  useEffect(() => {
    if (hydrated) saveCnTranslations(cnTranslations);
  }, [hydrated, cnTranslations]);

  // 词典合并：mock 内置词作为查词降级，加上生词本里快照的词，确保离线也能查看详情。
  const wordById = useMemo(() => {
    const map = new Map<string, Word>();
    for (const w of words) map.set(w.id, w);
    for (const u of userWords) if (u.word) map.set(u.word.id, u.word);
    return map;
  }, [userWords]);
  const dueWords = userWords.filter(item => isDue(item));
  const masteredWords = userWords.filter(item => item.mastered);
  const unmasteredWords = userWords.filter(item => !item.mastered);
  const currentReviewUserWord = reviewQueue[reviewIndex] ?? null;
  const currentReviewWord = currentReviewUserWord ? wordById.get(currentReviewUserWord.word_id) ?? null : null;
  const selectedUserWord = selectedWord ? userWords.find(item => item.word_id === selectedWord.id) : undefined;

  function navigate(next: ScreenName) {
    setHistory(prev => [...prev, screen]);
    setScreen(next);
  }

  function back(fallback: ScreenName = 'home') {
    setHistory(prev => {
      const nextHistory = [...prev];
      const previous = nextHistory.pop();
      setScreen(previous ?? fallback);
      return nextHistory;
    });
  }

  function switchTab(tab: TabName) {
    setActiveTab(tab);
    setHistory([]);
    setScreen(tab);
  }

  function jumpToBook(filter: BookFilter) {
    setBookFilter(filter);
    switchTab('book');
  }

  function openAiChat(word: Word) {
    if (!qwenApiKey.trim()) {
      Alert.alert(
        '未配置大模型 Key',
        '「问一问 AI」需要调用 Qwen 大模型，请先在「我的」中配置 Qwen API Key。',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '去配置',
            onPress: () => {
              setActiveTab('my');
              setHistory([]);
              setScreen('apiKey');
            }
          }
        ]
      );
      return;
    }
    setAiTargetWord(word);
    const key = word.word.toLowerCase();
    setChatMessages(chatHistory[key] ?? []);
    navigate('aiChat');
  }

  async function sendChat(content: string) {
    if (!aiTargetWord || chatBusy) return;
    const trimmed = content.trim();
    if (!trimmed) return;

    const key = aiTargetWord.word.toLowerCase();
    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    const nextMessages = [...chatMessages, userMsg];
    setChatMessages(nextMessages);
    setChatHistory(prev => ({ ...prev, [key]: nextMessages }));
    setChatBusy(true);

    const systemMsg: ChatMessage = {
      role: 'system',
      content: `你是一名亲切专业的英语学习辅导助手。学生正在学习的单词是「${aiTargetWord.word}」。请使用中文回答（除非学生明确要求英文），回答要简洁具体、贴近实际使用场景，必要时可补充英文例句，不要用 Markdown 表格。`
    };

    const outcome = await chatWithQwen([systemMsg, ...nextMessages], qwenApiKey);
    setChatBusy(false);

    if (outcome.kind === 'ok') {
      const replyMsg: ChatMessage = { role: 'assistant', content: outcome.reply };
      setChatMessages(prev => {
        const updated = [...prev, replyMsg];
        setChatHistory(history => ({ ...history, [key]: updated }));
        return updated;
      });
      return;
    }
    if (outcome.kind === 'no_key') {
      Alert.alert('未配置 API Key', '请先在「我的」中配置 Qwen API Key');
      return;
    }
    const errMsg =
      outcome.kind === 'timeout'
        ? '请求超时，请重试'
        : outcome.kind === 'network'
          ? '网络异常，请检查网络'
          : '请求失败，请重试';
    const errBubble: ChatMessage = { role: 'assistant', content: `⚠️ ${errMsg}` };
    setChatMessages(prev => {
      const updated = [...prev, errBubble];
      setChatHistory(history => ({ ...history, [key]: updated }));
      return updated;
    });
  }

  /**
   * 详情页「中文释义」按需翻译：
   * 如果该词已有缓存/本身带中文，直接切换展示；
   * 否则调 Qwen 以英文释义为输入，按顺序补齐 meaning_cn / example_cn 并缓存。
   */
  async function ensureChineseTranslation(word: Word) {
    const key = word.word.toLowerCase();
    const cached = cnTranslations[key];
    const hasInline = word.meanings.some(m => m.meaning_cn && m.meaning_cn.trim());
    if (hasInline || (cached && cached.length >= word.meanings.length)) {
      setShowChinese(true);
      return;
    }
    if (!qwenApiKey.trim()) {
      Alert.alert(
        '未配置大模型 Key',
        '查看中文释义需要调用 Qwen 大模型，请先在「我的」中配置 Qwen API Key。',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '去配置',
            onPress: () => {
              setActiveTab('my');
              setHistory([]);
              setScreen('apiKey');
            }
          }
        ]
      );
      return;
    }
    setTranslatingCn(true);
    const payload = word.meanings.map(m => ({ meaning_en: m.meaning_en, example_en: m.example_en }));
    const outcome = await translateMeaningsToChinese(payload, qwenApiKey);
    setTranslatingCn(false);
    if (outcome.kind === 'ok') {
      const items = outcome.items.slice(0, word.meanings.length);
      while (items.length < word.meanings.length) items.push({ meaning_cn: '', example_cn: '' });
      setCnTranslations(prev => ({ ...prev, [key]: items }));
      setShowChinese(true);
      return;
    }
    const msg =
      outcome.kind === 'timeout'
        ? '翻译超时，请重试'
        : outcome.kind === 'network'
          ? '网络异常，请检查网络'
          : outcome.kind === 'no_key'
            ? '请先在「我的」中配置 Qwen API Key'
            : '翻译失败，请重试';
    Alert.alert('中文释义获取失败', msg);
  }

  async function runSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsSearching(true);
    setSearchError('');
    const outcome = await searchWord(trimmed, qwenApiKey);
    setIsSearching(false);
    if (outcome.kind === 'ok') {
      setSearchResult(outcome.word);
      return;
    }
    setSearchResult(null);
    setSearchError(messageForOutcome(outcome));
  }

  function openWord(word: Word) {
    setSelectedWord(word);
    setShowChinese(false);
    navigate('detail');
  }

  function addSelectedWord() {
    if (!selectedWord) return;
    if (userWords.some(item => item.word_id === selectedWord.id)) {
      Alert.alert('提示', '该词已在生词本中');
      return;
    }

    setUserWords(prev => [
      ...prev,
      createUserWord(`uw-${selectedWord.id}-${Date.now()}`, selectedWord, reviewIntervals)
    ]);
    Alert.alert('添加成功', '已加入生词本');
  }

  function removeSelectedWord() {
    if (!selectedWord) return;
    const target = userWords.find(item => item.word_id === selectedWord.id);
    if (!target) return;
    Alert.alert(
      '移除生词本',
      `确定要把“${selectedWord.word}”从生词本移除吗？复习历史将保留。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '移除',
          style: 'destructive',
          onPress: () => {
            setUserWords(prev => prev.filter(item => item.id !== target.id));
          }
        }
      ]
    );
  }

  async function speak(word: string, accent: 'uk' | 'us' = 'us') {
    // 零配置发音：先走有道词典 CDN（同词同口音音频固定，无需任何 Key），
    // 失败再降级到 expo-speech 系统 TTS，保证离线/无网时仍可发音。
    const outcome = await fetchYoudaoAudio(word, accent);
    if (outcome.kind === 'ok') {
      playLocalAudio(outcome.uri);
      return;
    }
    Speech.stop();
    Speech.speak(word, {
      language: accent === 'uk' ? 'en-GB' : 'en-US',
      rate: 0.86
    });
  }

  function playLocalAudio(uri: string) {
    try {
      Speech.stop();
      const existing = audioPlayerRef.current;
      if (existing) {
        existing.replace({ uri });
      } else {
        audioPlayerRef.current = createAudioPlayer({ uri });
      }
      const player = audioPlayerRef.current;
      if (!player) return;
      player.seekTo(0).catch(() => undefined);
      player.play();
    } catch (err) {
      console.warn('[tts] play failed', err);
    }
  }

  function startReview() {
    const queue = userWords.filter(item => isDue(item));
    setReviewQueue(queue);
    setReviewIndex(0);
    setPreviousKnown(null);
    setShowChinese(false);
    if (queue.length === 0) {
      navigate('complete');
      return;
    }
    const first = wordById.get(queue[0].word_id);
    if (first && settings.autoPronounceOnReview) speak(first.word);
    navigate('review');
  }

  function markKnown() {
    if (!currentReviewUserWord || !currentReviewWord) return;

    const before = currentReviewUserWord;
    const after = completeReview(before, 'known', reviewIntervals);
    const logId = `log-${Date.now()}`;

    setUserWords(prev => prev.map(item => (item.id === before.id ? after : item)));
    setReviewLogs(prev => [
      ...prev,
      { id: logId, user_word_id: before.id, reviewed_at: new Date().toISOString(), result: 'known' }
    ]);
    setPreviousKnown({ userWord: after, before, logId });
    setCompletedToday(prev => prev + 1);
    setKnownToday(prev => prev + 1);
    advanceReview();
  }

  function showUnknownDetail() {
    if (!currentReviewWord) return;
    setSelectedWord(currentReviewWord);
    setReviewDetailMode('unknown');
    setShowChinese(false);
    navigate('reviewDetail');
  }

  function finishUnknown() {
    if (!currentReviewUserWord) return;
    const after = completeReview(currentReviewUserWord, 'unknown', reviewIntervals);

    setUserWords(prev => prev.map(item => (item.id === currentReviewUserWord.id ? after : item)));
    setReviewLogs(prev => [
      ...prev,
      {
        id: `log-${Date.now()}`,
        user_word_id: currentReviewUserWord.id,
        reviewed_at: new Date().toISOString(),
        result: 'unknown'
      }
    ]);
    setPreviousKnown(null);
    setCompletedToday(prev => prev + 1);
    goBackToReviewAndAdvance();
  }

  function openUndo() {
    if (!previousKnown) return;
    const word = wordById.get(previousKnown.before.word_id);
    if (!word) return;
    setSelectedWord(word);
    setReviewDetailMode('undo');
    setShowChinese(false);
    navigate('reviewDetail');
  }

  function confirmUndoUnknown() {
    if (!previousKnown) return;
    const after = completeReview(previousKnown.before, 'unknown', reviewIntervals);

    setUserWords(prev => prev.map(item => (item.id === previousKnown.before.id ? after : item)));
    setReviewLogs(prev => [
      ...prev.filter(log => log.id !== previousKnown.logId),
      {
        id: `log-${Date.now()}`,
        user_word_id: previousKnown.before.id,
        reviewed_at: new Date().toISOString(),
        result: 'unknown'
      }
    ]);
    setKnownToday(prev => Math.max(0, prev - 1));
    setPreviousKnown(null);
    back('review');
  }

  function advanceReview() {
    const nextIndex = reviewIndex + 1;
    if (nextIndex >= reviewQueue.length) {
      setReviewIndex(nextIndex);
      setTimeout(() => setScreen('complete'), 120);
      return;
    }

    setReviewIndex(nextIndex);
    const nextWord = wordById.get(reviewQueue[nextIndex].word_id);
    if (nextWord && settings.autoPronounceOnReview) speak(nextWord.word);
  }

  function goBackToReviewAndAdvance() {
    setScreen('review');
    setHistory([]);
    setTimeout(advanceReview, 0);
  }

  if (!hydrated) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={styles.complete}>
          <Text style={styles.muted}>加载中…</Text>
        </View>
      </View>
    );
  }

  const body = (() => {
    if (screen === 'home') {
      return (
        <HomeScreen
          dueWords={dueWords}
          unmasteredCount={unmasteredWords.length}
          masteredCount={masteredWords.length}
          completedToday={completedToday}
          onSearch={() => navigate('search')}
          onStartReview={startReview}
          onJumpBook={jumpToBook}
        />
      );
    }

    if (screen === 'search') {
      return (
        <SearchScreen
          query={query}
          setQuery={setQuery}
          isSearching={isSearching}
          result={searchResult}
          error={searchError}
          onSearch={runSearch}
          onBack={() => back('home')}
          onOpenWord={openWord}
        />
      );
    }

    if (screen === 'detail' && selectedWord) {
      const cnItems = cnTranslations[selectedWord.word.toLowerCase()] ?? null;
      return (
        <WordDetailScreen
          word={selectedWord}
          isAdded={Boolean(selectedUserWord)}
          showChinese={showChinese}
          translatingCn={translatingCn}
          extraCn={cnItems}
          onToggleChinese={() => {
            if (showChinese) setShowChinese(false);
            else ensureChineseTranslation(selectedWord);
          }}
          onBack={() => back('home')}
          onAdd={addSelectedWord}
          onRemove={removeSelectedWord}
          onSpeak={speak}
          onAiChat={() => openAiChat(selectedWord)}
        />
      );
    }

    if (screen === 'book') {
      return (
        <BookScreen
          unmastered={unmasteredWords}
          mastered={masteredWords}
          filter={bookFilter}
          onChangeFilter={setBookFilter}
          sort={bookSort}
          onChangeSort={setBookSort}
          wordById={wordById}
          onOpenWord={openWord}
        />
      );
    }

    if (screen === 'review') {
      return (
        <ReviewScreen
          currentWord={currentReviewWord}
          currentIndex={reviewIndex}
          total={reviewQueue.length}
          previousKnownWord={previousKnown ? wordById.get(previousKnown.before.word_id) ?? null : null}
          onBack={() => switchTab('home')}
          onKnown={markKnown}
          onUnknown={showUnknownDetail}
          onUndo={openUndo}
          onSpeak={speak}
        />
      );
    }

    if (screen === 'reviewDetail' && selectedWord) {
      return (
        <ReviewDetailScreen
          word={selectedWord}
          mode={reviewDetailMode}
          showChinese={showChinese}
          setShowChinese={setShowChinese}
          onBack={() => back('review')}
          onNext={finishUnknown}
          onKeepKnown={() => back('review')}
          onUndoUnknown={confirmUndoUnknown}
          onSpeak={speak}
        />
      );
    }

    if (screen === 'complete') {
      return (
        <CompleteScreen
          completed={completedToday}
          known={knownToday}
          onHome={() => switchTab('home')}
        />
      );
    }

    if (screen === 'my') {
      return (
        <MyScreen
          settings={settings}
          setSettings={setSettings}
          masteredCount={masteredWords.length}
          hasApiKey={qwenApiKey.trim().length > 0}
          onMastered={() => navigate('mastered')}
          onIntervals={() => navigate('intervals')}
          onApiKey={() => navigate('apiKey')}
        />
      );
    }

    if (screen === 'mastered') {
      return <MasteredScreen userWords={masteredWords} wordById={wordById} onBack={() => back('my')} />;
    }

    if (screen === 'intervals') {
      return <IntervalsScreen onBack={() => back('my')} />;
    }

    if (screen === 'apiKey') {
      return (
        <ApiKeyScreen
          apiKey={qwenApiKey}
          onSave={value => {
            setQwenApiKey(value);
            Alert.alert('已保存', value ? 'Qwen API Key 已生效' : '已清空，将走本地 mock');
          }}
          onBack={() => back('my')}
        />
      );
    }

    if (screen === 'aiChat' && aiTargetWord) {
      return (
        <AiChatScreen
          word={aiTargetWord}
          messages={chatMessages}
          busy={chatBusy}
          topInset={insets.top}
          onBack={() => back('detail')}
          onSend={sendChat}
        />
      );
    }

    return <EmptyScreen text="页面不存在" />;
  })();

  const showTabBar = ['home', 'book', 'my'].includes(screen);

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.appShell}>{body}</View>
      {showTabBar ? (
        <TabBar activeTab={activeTab} onTab={switchTab} bottomInset={insets.bottom} />
      ) : null}
    </View>
  );
}

function HomeScreen({
  dueWords,
  unmasteredCount,
  masteredCount,
  completedToday,
  onSearch,
  onStartReview,
  onJumpBook
}: {
  dueWords: UserWord[];
  unmasteredCount: number;
  masteredCount: number;
  completedToday: number;
  onSearch: () => void;
  onStartReview: () => void;
  onJumpBook: (filter: BookFilter) => void;
}) {
  const total = completedToday + dueWords.length;
  const progress = total === 0 ? 1 : completedToday / total;

  return (
    <View style={styles.screen}>
      <View style={styles.pageHeader}>
        <Pressable style={styles.searchPill} onPress={onSearch}>
          <Ionicons name="search" size={18} color={colors.primary} />
          <Text style={styles.searchText}>搜索单词或短语...</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>今日复习进度</Text>
        <View style={styles.progressCard}>
          <Text style={styles.progressLabel}>已完成 / 今日待复习</Text>
          <Text style={styles.progressNumber}>
            {completedToday} <Text style={styles.progressSmall}>/ {total}</Text>
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>词汇积累</Text>
        <Pressable style={styles.statCard} onPress={() => onJumpBook('mastered')}>
          <Text style={styles.muted}>已掌握单词</Text>
          <View style={styles.statValueRow}>
            <Text style={styles.statNumber}>{masteredCount}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </View>
        </Pressable>
        <Pressable style={styles.statCard} onPress={() => onJumpBook('unmastered')}>
          <Text style={styles.muted}>生词本总量</Text>
          <View style={styles.statValueRow}>
            <Text style={styles.statNumber}>{unmasteredCount}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </View>
        </Pressable>

        <PrimaryButton label="开始今日复习" onPress={onStartReview} />
      </ScrollView>
    </View>
  );
}

function SearchScreen({
  query,
  setQuery,
  isSearching,
  result,
  error,
  onSearch,
  onBack,
  onOpenWord
}: {
  query: string;
  setQuery: (value: string) => void;
  isSearching: boolean;
  result: Word | null;
  error: string;
  onSearch: () => void;
  onBack: () => void;
  onOpenWord: (word: Word) => void;
}) {
  return (
    <View style={styles.screen}>
      <Header title="查词" onBack={onBack} />
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="输入单词或短语"
          style={[styles.input, styles.searchInput]}
          onSubmitEditing={onSearch}
        />
        <Pressable style={styles.iconButton} onPress={onSearch}>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>
      </View>
      <View style={styles.content}>
        {isSearching ? <Skeleton /> : null}
        {!isSearching && error ? <EmptyCard text={error} /> : null}
        {!isSearching && result ? (
          <Pressable style={styles.resultCard} onPress={() => onOpenWord(result)}>
            <Text style={styles.listWord}>{result.word}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function WordDetailScreen({
  word,
  isAdded,
  showChinese,
  translatingCn,
  extraCn,
  onToggleChinese,
  onBack,
  onAdd,
  onRemove,
  onSpeak,
  onAiChat
}: {
  word: Word;
  isAdded: boolean;
  showChinese: boolean;
  translatingCn: boolean;
  extraCn: { meaning_cn: string; example_cn: string }[] | null;
  onToggleChinese: () => void;
  onBack: () => void;
  onAdd: () => void;
  onRemove: () => void;
  onSpeak: (word: string, accent: 'uk' | 'us') => void;
  onAiChat: () => void;
}) {
  const hasCollocations = word.collocations.length > 0;
  const cnButtonLabel = translatingCn ? '翻译中…' : showChinese ? '收起中文' : '中文释义';
  return (
    <View style={styles.screen}>
      <Header
        title="单词详情"
        onBack={onBack}
        right={
          <Pressable style={styles.aiEntry} onPress={onAiChat}>
            <Ionicons name="sparkles" size={14} color={colors.primary} />
            <Text style={styles.aiEntryText}>问一问 AI</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <WordHeader word={word} onSpeak={onSpeak} />
        {hasCollocations ? (
          <Section title="Common Collocations">
            {word.collocations.map(item => (
              <Text key={item} style={styles.collocation}>• {item}</Text>
            ))}
          </Section>
        ) : null}
        <Meanings word={word} showChinese={showChinese} extraCn={extraCn} />
        <SecondaryButton label={cnButtonLabel} onPress={onToggleChinese} />
        {isAdded ? (
          <PrimaryButton label="移除生词本" onPress={onRemove} style={styles.dangerButton} />
        ) : (
          <PrimaryButton label="加入生词本" onPress={onAdd} />
        )}
      </ScrollView>
    </View>
  );
}

function BookScreen({
  unmastered,
  mastered,
  filter,
  onChangeFilter,
  sort,
  onChangeSort,
  wordById,
  onOpenWord
}: {
  unmastered: UserWord[];
  mastered: UserWord[];
  filter: BookFilter;
  onChangeFilter: (f: BookFilter) => void;
  sort: BookSort;
  onChangeSort: (s: BookSort) => void;
  wordById: Map<string, Word>;
  onOpenWord: (word: Word) => void;
}) {
  const baseList = filter === 'mastered' ? mastered : unmastered;
  const list = useMemo(() => {
    if (sort === 'alpha') {
      return [...baseList].sort((a, b) => {
        const wa = wordById.get(a.word_id)?.word ?? '';
        const wb = wordById.get(b.word_id)?.word ?? '';
        return wa.toLowerCase().localeCompare(wb.toLowerCase());
      });
    }
    // 'recent'：按加入时间倒序（最新在前）。
    return [...baseList].sort((a, b) => (a.added_at < b.added_at ? 1 : a.added_at > b.added_at ? -1 : 0));
  }, [baseList, sort, wordById]);
  const emptyText = filter === 'mastered' ? '完成全部复习后会出现在这里' : '快去收集陌生词汇吧';

  return (
    <View style={styles.screen}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>单词本</Text>
        <View style={styles.segmented}>
          <Pressable
            style={[styles.segItem, filter === 'unmastered' && styles.segItemActive]}
            onPress={() => onChangeFilter('unmastered')}
          >
            <Text style={[styles.segText, filter === 'unmastered' && styles.segTextActive]}>
              未掌握 ({unmastered.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segItem, filter === 'mastered' && styles.segItemActive]}
            onPress={() => onChangeFilter('mastered')}
          >
            <Text style={[styles.segText, filter === 'mastered' && styles.segTextActive]}>
              已掌握 ({mastered.length})
            </Text>
          </Pressable>
        </View>
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>排序</Text>
          <Pressable
            style={[styles.sortChip, sort === 'recent' && styles.sortChipActive]}
            onPress={() => onChangeSort('recent')}
          >
            <Text style={[styles.sortChipText, sort === 'recent' && styles.sortChipTextActive]}>添加顺序</Text>
          </Pressable>
          <Pressable
            style={[styles.sortChip, sort === 'alpha' && styles.sortChipActive]}
            onPress={() => onChangeSort('alpha')}
          >
            <Text style={[styles.sortChipText, sort === 'alpha' && styles.sortChipTextActive]}>首字母</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {list.length === 0 ? <EmptyCard text={emptyText} /> : null}
        {list.map(item => {
          const word = wordById.get(item.word_id);
          if (!word) return null;
          return (
            <Pressable key={item.id} style={styles.bookItem} onPress={() => onOpenWord(word)}>
              <View style={styles.bookItemMain}>
                <Text style={styles.listWord}>{word.word}</Text>
                <Text style={styles.resultMeaning} numberOfLines={1}>{word.meanings[0]?.meaning_en}</Text>
              </View>
              <View style={styles.bookMeta}>
                {filter === 'mastered' ? (
                  <Text style={[styles.badge, styles.successBadge]}>已掌握</Text>
                ) : (
                  <>
                    <Text style={styles.muted}>{formatRelativeReviewTime(item.next_review_at)}</Text>
                    <Text style={styles.badge}>剩余 {item.review_remaining_count} 次</Text>
                  </>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ReviewScreen({
  currentWord,
  currentIndex,
  total,
  previousKnownWord,
  onBack,
  onKnown,
  onUnknown,
  onUndo,
  onSpeak
}: {
  currentWord: Word | null;
  currentIndex: number;
  total: number;
  previousKnownWord: Word | null;
  onBack: () => void;
  onKnown: () => void;
  onUnknown: () => void;
  onUndo: () => void;
  onSpeak: (word: string, accent: 'uk' | 'us') => void;
}) {
  if (!currentWord) return <EmptyScreen text="暂时没有可复习的词汇" />;

  return (
    <View style={styles.screen}>
      <Header title="今日复习" onBack={onBack} />
      <Text style={styles.reviewProgress}>{currentIndex + 1} / {total}</Text>
      {previousKnownWord ? (
        <Pressable style={styles.undoBar} onPress={onUndo}>
          <Text style={styles.undoText}>刚才标记了「{previousKnownWord.word}」为认识</Text>
          <Text style={styles.undoAction}>撤回</Text>
        </Pressable>
      ) : null}
      <View style={styles.reviewCard}>
        <Text style={styles.reviewWord}>{currentWord.word}</Text>
        <Phonetics word={currentWord} onSpeak={onSpeak} centered />
        <Text style={styles.reviewHint}>你认识这个词吗？</Text>
      </View>
      <View style={styles.reviewButtons}>
        <SecondaryButton label="不认识" onPress={onUnknown} style={styles.reviewButton} />
        <PrimaryButton label="认识" onPress={onKnown} style={styles.reviewButton} />
      </View>
    </View>
  );
}

function ReviewDetailScreen({
  word,
  mode,
  showChinese,
  setShowChinese,
  onBack,
  onNext,
  onKeepKnown,
  onUndoUnknown,
  onSpeak
}: {
  word: Word;
  mode: 'unknown' | 'undo';
  showChinese: boolean;
  setShowChinese: (value: boolean) => void;
  onBack: () => void;
  onNext: () => void;
  onKeepKnown: () => void;
  onUndoUnknown: () => void;
  onSpeak: (word: string, accent: 'uk' | 'us') => void;
}) {
  return (
    <View style={styles.screen}>
      <Header title="今日复习" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        {mode === 'undo' ? (
          <View style={styles.undoBanner}>
            <Text style={styles.undoText}>你之前标记了「认识」，确认要撤回吗？</Text>
          </View>
        ) : null}
        <WordHeader word={word} onSpeak={onSpeak} compact />
        <Section title="Collocations">
          <Text style={styles.collocation}>{word.collocations.join(', ')}</Text>
        </Section>
        <Meanings word={word} showChinese={showChinese} />
        <SecondaryButton label={showChinese ? '收起中文' : '查看中文'} onPress={() => setShowChinese(!showChinese)} />
        {mode === 'unknown' ? (
          <PrimaryButton label="下一个" onPress={onNext} />
        ) : (
          <View style={styles.reviewButtons}>
            <SecondaryButton label="仍然认识" onPress={onKeepKnown} style={styles.reviewButton} />
            <PrimaryButton label="撤回为不认识" onPress={onUndoUnknown} style={[styles.reviewButton, styles.dangerButton]} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function CompleteScreen({ completed, known, onHome }: { completed: number; known: number; onHome: () => void }) {
  const accuracy = completed === 0 ? 0 : Math.round((known / completed) * 100);
  const isEmpty = completed === 0;

  return (
    <View style={styles.complete}>
      {!isEmpty ? <ConfettiOverlay /> : null}
      <View style={styles.completeHero}>
        <Text style={styles.completeEmoji}>{isEmpty ? '🌱' : '🎉'}</Text>
        <Text style={styles.completeTitle}>
          {isEmpty ? '暂时没有可复习的词汇' : '今日复习完成！'}
        </Text>
        {!isEmpty ? (
          <Text style={styles.completeSubtitle}>
            {accuracy >= 80 ? '太棒啦，节奏稳稳的 ✨' : '坚持就是胜利，明天继续 💪'}
          </Text>
        ) : null}
      </View>

      {!isEmpty ? (
        <View style={styles.completeStatsRow}>
          <View style={styles.completeStatCard}>
            <Text style={styles.completeStatBig}>{completed}</Text>
            <Text style={styles.completeStatLabel}>完成单词</Text>
          </View>
          <View style={styles.completeStatCard}>
            <Text style={styles.completeStatBig}>{accuracy}%</Text>
            <Text style={styles.completeStatLabel}>认识占比</Text>
          </View>
        </View>
      ) : null}

      <PrimaryButton label="返回首页" onPress={onHome} style={styles.completeButton} />
    </View>
  );
}

const CONFETTI_EMOJIS = ['🎉', '🎊', '✨', '🌟', '💫', '🎈', '🥳', '⭐️'];
const CONFETTI_COUNT = 22;

function ConfettiOverlay() {
  const pieces = useMemo(() => Array.from({ length: CONFETTI_COUNT }, (_, i) => i), []);
  return (
    <View pointerEvents="none" style={styles.confettiLayer}>
      {pieces.map(i => (
        <ConfettiPiece key={i} index={i} />
      ))}
    </View>
  );
}

function ConfettiPiece({ index }: { index: number }) {
  const { width, height } = Dimensions.get('window');
  const fall = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const config = useMemo(() => {
    const startX = Math.random() * width;
    const swayRange = 24 + Math.random() * 56;
    const swayDir = Math.random() > 0.5 ? 1 : -1;
    const duration = 2600 + Math.random() * 1800;
    const delay = (index % 8) * 90 + Math.random() * 200;
    const rotateTurns = (1 + Math.floor(Math.random() * 3)) * (Math.random() > 0.5 ? 1 : -1);
    const fontSize = 22 + Math.floor(Math.random() * 12);
    const emoji = CONFETTI_EMOJIS[index % CONFETTI_EMOJIS.length];
    return { startX, swayRange, swayDir, duration, delay, rotateTurns, fontSize, emoji };
  }, [index, width]);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 240,
      delay: config.delay,
      useNativeDriver: true
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(sway, {
          toValue: 1,
          duration: 900 + Math.random() * 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(sway, {
          toValue: 0,
          duration: 900 + Math.random() * 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    ).start();

    Animated.timing(rotate, {
      toValue: 1,
      duration: config.duration,
      delay: config.delay,
      easing: Easing.linear,
      useNativeDriver: true
    }).start();

    Animated.timing(fall, {
      toValue: 1,
      duration: config.duration,
      delay: config.delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 320,
          useNativeDriver: true
        }).start();
      }
    });
  }, [config, fall, sway, rotate, opacity]);

  const translateY = fall.interpolate({ inputRange: [0, 1], outputRange: [-80, height + 60] });
  const translateX = sway.interpolate({
    inputRange: [0, 1],
    outputRange: [0, config.swayRange * config.swayDir]
  });
  const rotation = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${360 * config.rotateTurns}deg`]
  });

  return (
    <Animated.Text
      style={[
        styles.confettiPiece,
        {
          left: config.startX,
          fontSize: config.fontSize,
          opacity,
          transform: [{ translateY }, { translateX }, { rotate: rotation }]
        }
      ]}
    >
      {config.emoji}
    </Animated.Text>
  );
}

function MyScreen({
  settings,
  setSettings,
  masteredCount,
  hasApiKey,
  onMastered,
  onIntervals,
  onApiKey
}: {
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
  masteredCount: number;
  hasApiKey: boolean;
  onMastered: () => void;
  onIntervals: () => void;
  onApiKey: () => void;
}) {
  return (
    <View style={styles.screen}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>我的</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.myHeader}>
          <View style={styles.avatar}><Text style={styles.avatarText}>A</Text></View>
          <Text style={styles.myName}>Audrey</Text>
        </View>
        <View style={styles.menuItem}>
          <Text style={styles.menuLabel}>复习自动发音</Text>
          <Switch
            style={styles.menuSwitch}
            value={settings.autoPronounceOnReview}
            onValueChange={value => setSettings({ autoPronounceOnReview: value })}
            trackColor={{ false: '#D4D4D4', true: colors.primary }}
          />
        </View>
        <MenuItem label="复习间隔说明" onPress={onIntervals} />
        <MenuItem label="Qwen API Key" value={hasApiKey ? '已配置' : '未配置'} onPress={onApiKey} />
      </ScrollView>
    </View>
  );
}

function MasteredScreen({
  userWords,
  wordById,
  onBack
}: {
  userWords: UserWord[];
  wordById: Map<string, Word>;
  onBack: () => void;
}) {
  return (
    <View style={styles.screen}>
      <Header title="已掌握单词" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.muted}>共掌握 {userWords.length} 个单词</Text>
        {userWords.length === 0 ? <EmptyCard text="完成全部复习后会出现在这里" /> : null}
        {userWords.map(item => {
          const word = wordById.get(item.word_id);
          if (!word) return null;
          return (
            <View key={item.id} style={styles.listItem}>
              <Text style={styles.listWord}>{word.word}</Text>
              <Text style={[styles.badge, styles.successBadge]}>已掌握</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const DEFAULT_AI_PROMPTS = [
  '这个单词是否为生活日常用语？平时都怎么用？',
  '解释下这个词的使用场景，并给出对应的英文例句',
  '请用中文解释这个单词的核心含义与常用搭配'
];

function AiChatScreen({
  word,
  messages,
  busy,
  topInset,
  onBack,
  onSend
}: {
  word: Word;
  messages: ChatMessage[];
  busy: boolean;
  topInset: number;
  onBack: () => void;
  onSend: (content: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);
  const visibleMessages = messages.filter(m => m.role !== 'system');
  const showPrompts = visibleMessages.length === 0;

  function handleSend() {
    const value = draft.trim();
    if (!value || busy) return;
    setDraft('');
    onSend(value);
  }

  function handlePromptPress(prompt: string) {
    if (busy) return;
    onSend(prompt);
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? topInset : 0}
    >
      <Header title={`问一问 AI·${word.word}`} onBack={onBack} />
      <ScrollView
        ref={scrollRef}
        style={styles.chatScroll}
        contentContainerStyle={styles.chatContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        <View style={styles.chatIntro}>
          <Text style={styles.chatIntroTitle}>今天请教一下「{word.word}」</Text>
          <Text style={styles.chatIntroSub}>选下面推荐问题快速开始，也可以直接输入问题。</Text>
        </View>
        {visibleMessages.map((m, idx) => (
          <View
            key={`${m.role}-${idx}`}
            style={[styles.chatBubble, m.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAi]}
          >
            <Text style={[styles.chatBubbleText, m.role === 'user' && styles.chatBubbleTextUser]}>
              {m.content}
            </Text>
          </View>
        ))}
        {busy ? (
          <View style={[styles.chatBubble, styles.chatBubbleAi, styles.chatLoadingBubble]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.chatLoadingText}>AI 正在思考…</Text>
          </View>
        ) : null}
      </ScrollView>

      {showPrompts ? (
        <View style={styles.chatPromptList}>
          {DEFAULT_AI_PROMPTS.map(prompt => (
            <Pressable
              key={prompt}
              style={styles.chatPromptChip}
              onPress={() => handlePromptPress(prompt)}
              disabled={busy}
            >
              <Ionicons name="sparkles" size={14} color={colors.primary} />
              <Text style={styles.chatPromptText} numberOfLines={2}>{prompt}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.chatInputRow}>
        <TextInput
          style={styles.chatInput}
          value={draft}
          onChangeText={setDraft}
          placeholder="输入问题..."
          multiline
          maxLength={500}
          editable={!busy}
        />
        <Pressable
          style={[styles.chatSendBtn, (!draft.trim() || busy) && styles.chatSendBtnDisabled]}
          onPress={handleSend}
          disabled={!draft.trim() || busy}
        >
          <Ionicons name="arrow-up" size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function ApiKeyScreen({
  apiKey,
  onSave,
  onBack
}: {
  apiKey: string;
  onSave: (value: string) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(apiKey);
  return (
    <View style={styles.screen}>
      <Header title="Qwen API Key" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.paragraph}>
          填入阿里云 DashScope 的 API Key（以 sk- 开头）。Key 仅本地存储，未上传。未填则查词走内置示例词。
        </Text>
        <TextInput
          style={[styles.input, styles.apiKeyInput]}
          value={draft}
          onChangeText={setDraft}
          placeholder="sk-xxxxxxxx"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <PrimaryButton label="保存" onPress={() => onSave(draft.trim())} />
        <SecondaryButton label="清空" onPress={() => { setDraft(''); onSave(''); }} />
      </ScrollView>
    </View>
  );
}

function messageForOutcome(outcome: SearchOutcome): string {
  switch (outcome.kind) {
    case 'not_found':
      return '该词不存在';
    case 'timeout':
      return '查询超时，请重试';
    case 'network':
      return '网络连接失败';
    case 'no_key':
      return '请先在「我的」中配置 Qwen API Key';
    case 'failed':
    default:
      return '查询失败，请重试';
  }
}

function IntervalsScreen({ onBack }: { onBack: () => void }) {
  const totalDays = reviewIntervals.reduce((sum, d) => sum + d, 0);
  return (
    <View style={styles.screen}>
      <Header title="复习间隔说明" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.paragraph}>
          每个生词需要累计完成 {reviewIntervals.length} 轮「认识」才会标为已掌握，全程约 {totalDays} 天。每轮间隔从上一次复习完成时间起算。
        </Text>
        <View style={styles.intervalCard}>
          {reviewIntervals.map((days, index) => (
            <View key={`${index}-${days}`} style={styles.intervalRow}>
              <Text style={styles.muted}>第 {index + 1} 轮</Text>
              <Text style={styles.intervalValue}>{index === 0 ? `加入后 ${days} 天` : `再过 ${days} 天`}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.paragraph}>
          点「不认识」：当前轮间隔归零，2 天后重新出现，但已累计的「认识」次数不会退回。
        </Text>
        <Text style={styles.paragraph}>
          已掌握的词不再进入复习队列，可在「我的 · 已掌握」里翻看。
        </Text>
      </ScrollView>
    </View>
  );
}

function WordHeader({
  word,
  onSpeak,
  compact = false
}: {
  word: Word;
  onSpeak: (word: string, accent: 'uk' | 'us') => void;
  compact?: boolean;
}) {
  return (
    <View style={styles.wordHeader}>
      <Text style={[styles.wordTitle, compact && styles.wordTitleCompact]}>{word.word}</Text>
      <Phonetics word={word} onSpeak={onSpeak} />
      <View style={styles.tagRow}>
        {word.usage_tags.map(tag => (
          <Text key={tag} style={styles.tag}>{tag === 'written' ? '书面语' : '口语'}</Text>
        ))}
      </View>
    </View>
  );
}

function Phonetics({
  word,
  onSpeak,
  centered = false
}: {
  word: Word;
  onSpeak: (word: string, accent: 'uk' | 'us') => void;
  centered?: boolean;
}) {
  return (
    <View style={[styles.phoneticRow, centered && styles.centered]}>
      <Pressable onPress={() => onSpeak(word.word, 'uk')}>
        <Text style={styles.phonetic}>UK {word.phonetic_uk}</Text>
      </Pressable>
      <Text style={styles.phoneticDivider}>|</Text>
      <Pressable onPress={() => onSpeak(word.word, 'us')}>
        <Text style={styles.phonetic}>US {word.phonetic_us}</Text>
      </Pressable>
    </View>
  );
}

function Meanings({
  word,
  showChinese,
  extraCn = null
}: {
  word: Word;
  showChinese: boolean;
  extraCn?: { meaning_cn: string; example_cn: string }[] | null;
}) {
  return (
    <>
      {word.meanings.map((meaning, index) => {
        const fallback = extraCn?.[index];
        const cnMeaning = meaning.meaning_cn || fallback?.meaning_cn || '';
        const cnExample = meaning.example_cn || fallback?.example_cn || '';
        return (
          <View key={`${word.id}-${index}`} style={styles.meaningBlock}>
            <Text style={styles.meaningLabel}>Meaning {index + 1}</Text>
            <Text style={styles.meaningEn}>{meaning.meaning_en}</Text>
            {showChinese && cnMeaning ? <Text style={styles.meaningCn}>{cnMeaning}</Text> : null}
            {meaning.example_en ? <Text style={styles.example}>{meaning.example_en}</Text> : null}
            {showChinese && cnExample ? <Text style={styles.meaningCn}>{cnExample}</Text> : null}
          </View>
        );
      })}
    </>
  );
}

function Header({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color={colors.primary} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerSpacer} />
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

function TabBar({
  activeTab,
  onTab,
  bottomInset = 0
}: {
  activeTab: TabName;
  onTab: (tab: TabName) => void;
  bottomInset?: number;
}) {
  const tabs: Array<{ id: TabName; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { id: 'home', label: '首页', icon: 'home-outline' },
    { id: 'book', label: '单词本', icon: 'book-outline' },
    { id: 'my', label: '我的', icon: 'person-outline' }
  ];

  return (
    <View style={[styles.tabBar, { paddingBottom: bottomInset }]}>
      {tabs.map(tab => {
        const active = tab.id === activeTab;
        return (
          <Pressable key={tab.id} style={styles.tabItem} onPress={() => onTab(tab.id)}>
            <Ionicons name={tab.icon} size={22} color={active ? colors.primary : colors.faint} />
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionKicker}>{title}</Text>
      {children}
    </View>
  );
}

function MenuItem({
  label,
  value,
  onPress,
  destructive = false
}: {
  label: string;
  value?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <Text style={[styles.menuLabel, destructive && { color: colors.danger }]}>{label}</Text>
      <View style={styles.menuValueRow}>
        {value ? <Text style={styles.menuValue}>{value}</Text> : null}
        <Ionicons name="chevron-forward" size={18} color={destructive ? colors.danger : colors.faint} />
      </View>
    </Pressable>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
  style
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable style={[styles.primaryButton, disabled && styles.disabledButton, style]} onPress={onPress} disabled={disabled}>
      <Text style={[styles.primaryText, disabled && styles.disabledText]}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress, style }: { label: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable style={[styles.secondaryButton, style]} onPress={onPress}>
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function EmptyScreen({ text }: { text: string }) {
  return (
    <View style={styles.complete}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function Skeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <View style={[styles.skeleton, { width: '65%' }]} />
      <View style={[styles.skeleton, { width: '42%' }]} />
      <View style={[styles.skeleton, { width: '100%', height: 72 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg
  },
  appShell: {
    flex: 1
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    padding: 16,
    paddingBottom: 96
  },
  pageHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    padding: 3,
    marginTop: 12
  },
  segItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8
  },
  segItemActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1
  },
  segText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700'
  },
  segTextActive: {
    color: colors.primary
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10
  },
  sortLabel: {
    color: colors.muted,
    fontSize: 12,
    marginRight: 8
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: 8
  },
  sortChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  sortChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600'
  },
  sortChipTextActive: {
    color: '#fff'
  },
  bookItemMain: {
    flex: 1
  },
  login: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
    backgroundColor: colors.surface
  },
  logo: {
    color: colors.primary,
    fontSize: 38,
    fontWeight: '800',
    textAlign: 'center'
  },
  loginSubtitle: {
    color: colors.muted,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 36
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
    marginBottom: 12
  },
  primaryButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12
  },
  primaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  },
  secondaryButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12
  },
  secondaryText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700'
  },
  disabledButton: {
    backgroundColor: '#E5E5E5'
  },
  disabledText: {
    color: colors.faint
  },
  dangerButton: {
    backgroundColor: colors.danger
  },
  searchPill: {
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8
  },
  searchText: {
    color: colors.muted,
    fontSize: 15
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 8
  },
  progressCard: {
    borderRadius: 16,
    backgroundColor: colors.primary,
    padding: 20
  },
  progressLabel: {
    color: '#EEE7FF',
    fontSize: 13
  },
  progressNumber: {
    color: '#fff',
    fontSize: 38,
    fontWeight: '800',
    marginTop: 4
  },
  progressSmall: {
    fontSize: 18,
    fontWeight: '500',
    color: '#EEE7FF'
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.32)',
    overflow: 'hidden',
    marginTop: 12
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff'
  },
  listItem: {
    minHeight: 58,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  listWord: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800'
  },
  badge: {
    color: colors.primary,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 9,
    fontSize: 12,
    overflow: 'hidden'
  },
  successBadge: {
    color: colors.success,
    backgroundColor: '#ECFDF5'
  },
  statCard: {
    minHeight: 56,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  muted: {
    color: colors.muted,
    fontSize: 14
  },
  statNumber: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '800'
  },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  headerSpacer: {
    flex: 1
  },
  headerRight: {
    marginLeft: 8
  },
  aiEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt
  },
  aiEntryText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700'
  },
  chatScroll: {
    flex: 1,
    backgroundColor: colors.bg
  },
  chatContent: {
    padding: 16,
    paddingBottom: 20,
    gap: 10
  },
  chatIntro: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 4
  },
  chatIntroTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4
  },
  chatIntroSub: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20
  },
  chatBubble: {
    maxWidth: '86%',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  chatBubbleAi: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface
  },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary
  },
  chatBubbleText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22
  },
  chatBubbleTextUser: {
    color: '#fff'
  },
  chatLoadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  chatLoadingText: {
    color: colors.muted,
    fontSize: 13
  },
  chatPromptList: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8
  },
  chatPromptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  chatPromptText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    lineHeight: 19
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface
  },
  chatInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    color: colors.text,
    fontSize: 15
  },
  chatSendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  chatSendBtnDisabled: {
    backgroundColor: '#C9C7D0'
  },
  backButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800'
  },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8
  },
  searchInput: {
    flex: 1
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16
  },
  resultMeaning: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 5,
    lineHeight: 19
  },
  wordHeader: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8
  },
  wordTitle: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800'
  },
  wordTitleCompact: {
    fontSize: 28
  },
  phoneticRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 7
  },
  centered: {
    justifyContent: 'center'
  },
  phonetic: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600'
  },
  phoneticDivider: {
    color: colors.faint
  },
  tagRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10
  },
  tag: {
    color: colors.primary,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    fontSize: 12,
    overflow: 'hidden'
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 8
  },
  sectionKicker: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 8
  },
  collocation: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 23
  },
  meaningBlock: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 8
  },
  meaningLabel: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6
  },
  meaningEn: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 23
  },
  meaningCn: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 4
  },
  example: {
    color: colors.muted,
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 22,
    marginTop: 8
  },
  bookItem: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  bookMeta: {
    alignItems: 'flex-end',
    gap: 6
  },
  pageTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800'
  },
  reviewProgress: {
    color: colors.muted,
    textAlign: 'center',
    fontSize: 14,
    marginTop: 4
  },
  undoBar: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: colors.warningBg,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8
  },
  undoBanner: {
    backgroundColor: colors.warningBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8
  },
  undoText: {
    color: colors.warningText,
    fontSize: 13,
    flex: 1
  },
  undoAction: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800'
  },
  reviewCard: {
    margin: 16,
    minHeight: 270,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },
  reviewWord: {
    color: colors.text,
    fontSize: 40,
    fontWeight: '800'
  },
  reviewHint: {
    color: colors.faint,
    fontSize: 14,
    marginTop: 26
  },
  reviewButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16
  },
  reviewButton: {
    flex: 1
  },
  complete: {
    flex: 1,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    overflow: 'hidden'
  },
  completeHero: {
    alignItems: 'center'
  },
  completeEmoji: {
    fontSize: 84,
    marginBottom: 8
  },
  completeTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 6,
    textAlign: 'center'
  },
  completeSubtitle: {
    color: colors.muted,
    fontSize: 15,
    textAlign: 'center'
  },
  completeStatsRow: {
    flexDirection: 'row',
    gap: 12,
    alignSelf: 'stretch',
    marginTop: 28,
    marginBottom: 8
  },
  completeStatCard: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center'
  },
  completeStatBig: {
    color: colors.primary,
    fontSize: 30,
    fontWeight: '800'
  },
  completeStatLabel: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4
  },
  completeButton: {
    alignSelf: 'stretch',
    marginTop: 16
  },
  confettiLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden'
  },
  confettiPiece: {
    position: 'absolute',
    top: 0
  },
  myHeader: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800'
  },
  myName: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '800',
    marginTop: 10
  },
  menuItem: {
    minHeight: 58,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  menuSwitch: {
    alignSelf: 'center'
  },
  menuLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600'
  },
  menuValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3
  },
  menuValue: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800'
  },
  intervalCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    padding: 10,
    marginVertical: 14
  },
  intervalRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E6DDFF'
  },
  intervalValue: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '800'
  },
  apiKeyInput: {
    marginTop: 12
  },
  paragraph: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 25
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 22,
    alignItems: 'center',
    marginBottom: 8
  },
  emptyText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center'
  },
  skeletonWrap: {
    gap: 12
  },
  skeleton: {
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E8E8EF'
  },
  tabBar: {
    minHeight: 68,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    paddingTop: 4
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3
  },
  tabLabel: {
    color: colors.faint,
    fontSize: 11,
    fontWeight: '700'
  },
  tabLabelActive: {
    color: colors.primary
  }
});
