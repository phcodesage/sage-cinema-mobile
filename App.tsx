import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

type Movie = {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  number_of_seasons?: number;
  vote_average?: number;
  popularity?: number;
  media_type?: string;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  tagline?: string;
  runtime?: number;
  episode_run_time?: number[];
  original_language?: string;
  status?: string;
  production_companies?: { id: number; name: string }[];
};

type PlaybackSource = {
  id: string;
  label: string;
  quality: string;
  type: 'hls' | 'mp4' | 'dash' | 'unknown';
  playbackUrl: string;
  provider: string;
};

type PlaybackSubtitle = {
  id: string;
  lang: string;
  language: string;
  url: string;
};

type Collections = {
  trending: Movie[];
  latest: Movie[];
  tv: Movie[];
  topRated: Movie[];
  action: Movie[];
  anime: Movie[];
};

type Tab = 'home' | 'films' | 'series' | 'search' | 'browse' | 'genre';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://sage-cinema-nu.vercel.app').replace(/\/$/, '');
const POSTER_URL = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_URL = 'https://image.tmdb.org/t/p/w1280';
const PLAYBACK_SERVERS = ['cdn', 'vsrc', 'm4uhd', 'superflix'];
const EMPTY_COLLECTIONS: Collections = {
  trending: [],
  latest: [],
  tv: [],
  topRated: [],
  action: [],
  anime: [],
};

const titleOf = (movie: Movie) => movie.title || movie.name || 'Untitled';
const yearOf = (movie: Movie) => (movie.release_date || movie.first_air_date || '').slice(0, 4) || '—';
const isSeries = (movie: Movie) => movie.media_type === 'tv' || Boolean(movie.first_air_date);
const typeLabel = (movie: Movie) => (isSeries(movie) ? 'Series' : 'Film');
const API_REQUEST_TIMEOUT_MS = 15_000;

function genreIdsOf(movie: Movie) {
  return movie.genres?.map((genre) => genre.id) || movie.genre_ids || [];
}

function sharesStudio(first: Movie, second: Movie) {
  const firstStudios = first.production_companies || [];
  const secondStudios = second.production_companies || [];
  return firstStudios.some((firstStudio) => secondStudios.some((secondStudio) => (
    firstStudio.id === secondStudio.id
      || Boolean(firstStudio.name && secondStudio.name && firstStudio.name.toLowerCase() === secondStudio.name.toLowerCase())
  )));
}

function rankRelatedMovies(target: Movie, pool: Movie[], limit = 12) {
  const targetGenres = new Set(genreIdsOf(target));
  const targetType = isSeries(target) ? 'tv' : 'movie';

  return pool
    .filter((movie) => movie.id !== target.id)
    .map((movie) => {
      const matchingGenres = genreIdsOf(movie).filter((id) => targetGenres.has(id));
      let score = 0;
      if (sharesStudio(target, movie)) score += 2000;
      score += matchingGenres.length * 500;
      if (matchingGenres.length === targetGenres.size && targetGenres.size > 0) score += 2000;
      if ((isSeries(movie) ? 'tv' : 'movie') === targetType) score += 100;
      score += (movie.vote_average || 0) * 10;
      score += Math.log10(Math.max(movie.popularity || 0, 1));
      return { movie, score };
    })
    .sort((first, second) => second.score - first.score)
    .slice(0, limit)
    .map(({ movie }) => movie);
}

function resolveApiUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_URL}${value.startsWith('/') ? '' : '/'}${value}`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && error.name === 'AbortError';
}

async function fetchApiJson<T>(
  path: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs || API_REQUEST_TIMEOUT_MS;
  const requestController = new AbortController();
  const timeoutId = setTimeout(() => requestController.abort(), timeoutMs);
  const abortRequest = () => requestController.abort();

  if (options.signal?.aborted) requestController.abort();
  else options.signal?.addEventListener('abort', abortRequest, { once: true });

  try {
    const response = await fetch(resolveApiUrl(path), { signal: requestController.signal });
    const payload = await response.json() as unknown;
    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `API request failed with status ${response.status}`;
      throw new Error(message);
    }
    return payload as T;
  } catch (error) {
    if (requestController.signal.aborted && !options.signal?.aborted) {
      const timeoutError = new Error(`API request timed out after ${timeoutMs}ms`);
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', abortRequest);
  }
}

function rating(movie: Movie) {
  return movie.vote_average ? movie.vote_average.toFixed(1) : '—';
}

function Icon({ name, size = 20, color = COLORS.paper }: { name: string; size?: number; color?: string }) {
  return <Ionicons name={name as never} size={size} color={color} />;
}

function Brand() {
  return (
    <View style={styles.brand}>
      <View style={styles.brandOrbit}>
        <View style={styles.brandOrbitDot} />
      </View>
      <View>
        <Text style={styles.brandName}>SAGE</Text>
        <Text style={styles.brandSub}>CINEMA</Text>
      </View>
    </View>
  );
}

function Header({ onSearch, onBrowse }: { onSearch: () => void; onBrowse: () => void }) {
  return (
    <View style={styles.header}>
      <Brand />
      <View style={styles.headerActions}>
        <Pressable
          accessibilityLabel="Search the catalog"
          onPress={onSearch}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Icon name="search" size={21} color={COLORS.cyan} />
        </Pressable>
        <Pressable
          accessibilityLabel="Open browse menu"
          onPress={onBrowse}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Icon name="menu" size={22} />
        </Pressable>
      </View>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  secondary = false,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, secondary ? styles.actionButtonSecondary : styles.actionButtonPrimary, pressed && styles.pressed]}
    >
      <Icon name={icon} size={18} color={secondary ? COLORS.paper : COLORS.ink} />
      <Text style={[styles.actionButtonText, secondary && styles.actionButtonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

function PosterCard({ movie, onPress }: { movie: Movie; onPress: (movie: Movie) => void }) {
  return (
    <Pressable
      accessibilityLabel={`Open ${titleOf(movie)}`}
      onPress={() => onPress(movie)}
      style={({ pressed }) => [styles.posterCard, pressed && styles.posterPressed]}
    >
      <View style={styles.posterFrame}>
        {movie.poster_path ? (
          <Image source={{ uri: `${POSTER_URL}${movie.poster_path}` }} style={styles.posterImage} />
        ) : (
          <View style={styles.posterFallback}>
            <Icon name="film-outline" size={30} color={COLORS.muted} />
            <Text style={styles.posterFallbackText}>No artwork</Text>
          </View>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(8,10,18,0.78)']}
          style={styles.posterGradient}
        />
        <View style={styles.ratingPill}>
          <Icon name="star" size={11} color={COLORS.lime} />
          <Text style={styles.ratingText}>{rating(movie)}</Text>
        </View>
        <View style={styles.posterPlay}>
          <Icon name="play" size={14} color={COLORS.ink} />
        </View>
      </View>
      <Text numberOfLines={1} style={styles.posterTitle}>{titleOf(movie)}</Text>
      <Text style={styles.posterMeta}>{yearOf(movie)}  ·  {typeLabel(movie)}</Text>
    </Pressable>
  );
}

function Shelf({
  kicker,
  title,
  note,
  movies,
  onPress,
}: {
  kicker: string;
  title: string;
  note: string;
  movies: Movie[];
  onPress: (movie: Movie) => void;
}) {
  if (!movies.length) return null;

  return (
    <View style={styles.shelfSection}>
      <View style={styles.shelfHeading}>
        <View style={styles.shelfHeadingCopy}>
          <Text style={styles.sectionKicker}>{kicker}</Text>
          <Text style={styles.shelfTitle}>{title}</Text>
        </View>
        <Text style={styles.shelfNote}>{note}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.shelfTrack}
      >
        {movies.slice(0, 14).map((movie, index) => (
          <PosterCard key={`${movie.id}-${index}`} movie={movie} onPress={onPress} />
        ))}
      </ScrollView>
    </View>
  );
}

function Featured({ movie, onPlay, onDetails }: { movie: Movie | null; onPlay: () => void; onDetails: () => void }) {
  if (!movie) {
    return (
      <View style={styles.featuredLoading}>
        <ActivityIndicator color={COLORS.lime} />
        <Text style={styles.mutedText}>Tuning the projector…</Text>
      </View>
    );
  }

  return (
    <View style={styles.featured}>
      {movie.backdrop_path && (
        <ImageBackground
          source={{ uri: `${BACKDROP_URL}${movie.backdrop_path}` }}
          style={StyleSheet.absoluteFill}
          imageStyle={styles.featuredBackdrop}
        />
      )}
      <LinearGradient
        colors={['rgba(8,10,18,0.92)', 'rgba(8,10,18,0.55)', 'rgba(8,10,18,0.97)']}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.featuredGrid} />
      <View style={styles.featuredCopy}>
        <Text style={styles.signalLabel}>SAGE CINEMA  /  SIGNAL 01</Text>
        <Text numberOfLines={3} style={styles.featuredTitle}>{titleOf(movie)}</Text>
        <View style={styles.featuredMeta}>
          <Text style={styles.matchText}>{Math.round((movie.vote_average || 0) * 10)}% match</Text>
          <Text style={styles.featuredMetaText}>{yearOf(movie)}</Text>
          <Text style={styles.featuredMetaText}>{typeLabel(movie)}</Text>
          <Text style={styles.featuredMetaText}>4K</Text>
        </View>
        <Text numberOfLines={3} style={styles.featuredOverview}>
          {movie.overview || 'A new story is waiting for you.'}
        </Text>
        <View style={styles.featuredActions}>
          <ActionButton label="Play now" icon="play" onPress={onPlay} />
          <ActionButton label="Details" icon="information-circle-outline" onPress={onDetails} secondary />
        </View>
      </View>
      <View style={styles.featuredPosterWrap}>
        {movie.poster_path ? (
          <Image source={{ uri: `${POSTER_URL}${movie.poster_path}` }} style={styles.featuredPoster} />
        ) : (
          <View style={[styles.featuredPoster, styles.posterFallback]}><Icon name="film-outline" size={36} color={COLORS.muted} /></View>
        )}
        <View style={styles.nowPlayingBadge}><Text style={styles.nowPlayingText}>NOW PLAYING</Text></View>
      </View>
      <View style={styles.featuredFooter}>
        <View style={styles.liveSignal}><View style={styles.liveDot} /><Text style={styles.featuredFooterText}>Live catalog signal</Text></View>
        <Text style={styles.featuredFooterText}>Scroll to explore  ↓</Text>
      </View>
    </View>
  );
}

function CatalogList({
  movies,
  onPress,
  contentContainerStyle,
  emptyComponent,
}: {
  movies: Movie[];
  onPress: (movie: Movie) => void;
  contentContainerStyle: StyleProp<ViewStyle>;
  emptyComponent?: ReactElement | null;
}) {
  const renderItem = useCallback(({ item }: { item: Movie }) => (
    <View style={styles.catalogCell}>
      <PosterCard movie={item} onPress={onPress} />
    </View>
  ), [onPress]);

  return (
    <FlatList
      data={movies}
      renderItem={renderItem}
      keyExtractor={(movie, index) => `${movie.media_type || (movie.first_air_date ? 'tv' : 'movie')}-${movie.id}-${index}`}
      numColumns={2}
      columnWrapperStyle={styles.catalogRow}
      style={styles.screenFill}
      contentContainerStyle={contentContainerStyle}
      ListEmptyComponent={emptyComponent}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      updateCellsBatchingPeriod={50}
      windowSize={7}
      removeClippedSubviews
      showsVerticalScrollIndicator={false}
    />
  );
}

function ScreenHeading({
  eyebrow,
  title,
  detail,
  onBack,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  onBack?: () => void;
}) {
  return (
    <View style={styles.screenHeading}>
      {onBack ? (
        <Pressable onPress={onBack} style={({ pressed }) => [styles.screenBack, pressed && styles.pressed]}>
          <Icon name="arrow-back" size={16} color={COLORS.cyan} />
          <Text style={styles.screenBackText}>Browse all genres</Text>
        </Pressable>
      ) : null}
      <Text style={styles.sectionKicker}>{eyebrow}</Text>
      <Text style={styles.screenTitle}>{title}</Text>
      <Text style={styles.screenDetail}>{detail}</Text>
    </View>
  );
}

function SearchScreen({
  query,
  setQuery,
  results,
  searching,
  onPress,
}: {
  query: string;
  setQuery: (value: string) => void;
  results: Movie[];
  searching: boolean;
  onPress: (movie: Movie) => void;
}) {
  return (
    <View style={styles.searchScreen}>
      <ScreenHeading eyebrow="Catalog search" title="Find your next watch." detail="Films, series, and anime from one place." />
      <View style={styles.searchField}>
        <Icon name="search" size={21} color={COLORS.cyan} />
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="Try a title or platform"
          placeholderTextColor={COLORS.muted}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {searching ? <ActivityIndicator color={COLORS.lime} size="small" /> : null}
        {query ? (
          <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search">
            <Icon name="close-circle" size={20} color={COLORS.muted} />
          </Pressable>
        ) : null}
      </View>
      <CatalogList
        movies={query && results.length ? results : []}
        onPress={onPress}
        contentContainerStyle={styles.searchResultsContent}
        emptyComponent={(
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}><Icon name={query ? 'film-outline' : 'search-outline'} size={30} color={COLORS.cyan} /></View>
            <Text style={styles.sectionKicker}>{query ? 'No matches yet' : 'Open the catalog'}</Text>
            <Text style={styles.emptyTitle}>{query ? 'Nothing in this signal.' : 'What are you in the mood for?'}</Text>
            <Text style={styles.emptyCopy}>{query ? 'Try another title, spelling, or platform.' : 'Search by title, series, or platform and we’ll bring the screening room to you.'}</Text>
          </View>
        )}
      />
    </View>
  );
}

function BrowseScreen({ genres, onGenre }: { genres: Record<number, string>; onGenre: (id: number) => void }) {
  const genreEntries = Object.entries(genres);

  return (
    <View style={styles.screenFill}>
      <ScreenHeading eyebrow="Browse the signal" title="Pick a feeling." detail="Jump into a world by genre." />
      <ScrollView style={styles.screenFill} contentContainerStyle={styles.browseContent} showsVerticalScrollIndicator={false}>
        <View style={styles.genreGrid}>
          {genreEntries.map(([id, name]) => (
            <Pressable
              key={id}
              onPress={() => onGenre(Number(id))}
              style={({ pressed }) => [styles.genreChip, pressed && styles.genreChipPressed]}
            >
              <Text style={styles.genreChipText}>{name}</Text>
              <Icon name="arrow-forward" size={16} color={COLORS.cyan} />
            </Pressable>
          ))}
        </View>
        {!genreEntries.length && <ActivityIndicator color={COLORS.lime} style={styles.loadingIndicator} />}
      </ScrollView>
    </View>
  );
}

function MovieSheet({
  movie,
  genres,
  onClose,
  onPlay,
}: {
  movie: Movie | null;
  genres: Record<number, string>;
  onClose: () => void;
  onPlay: (movie: Movie) => void;
}) {
  const [details, setDetails] = useState<Movie | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const insets = useSafeAreaInsets();

  const mediaType = movie && isSeries(movie) ? 'tv' : 'movie';

  useEffect(() => {
    if (!movie) {
      setDetails(null);
      setDetailsLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setDetails(movie);
    setDetailsLoading(true);
    setPosterFailed(false);

    fetchApiJson<Movie>(`/api/movie/${movie.id}?type=${mediaType}`, { signal: controller.signal })
      .then((payload) => {
        if (active && payload && payload.id === movie.id) setDetails({ ...movie, ...payload });
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setDetailsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [mediaType, movie?.id]);

  const activeMovie = details?.id === movie?.id ? details : movie;
  const posterPath = activeMovie?.poster_path || activeMovie?.backdrop_path;
  const genreNames = activeMovie?.genres?.map((genre) => genre.name).slice(0, 3)
    || activeMovie?.genre_ids?.map((id) => genres[id]).filter(Boolean).slice(0, 3)
    || [];

  return (
    <Modal visible={Boolean(movie)} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close details" />
        <View style={[styles.movieSheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          {activeMovie?.backdrop_path && (
            <Image source={{ uri: `${BACKDROP_URL}${activeMovie.backdrop_path}` }} style={styles.sheetBackdrop} />
          )}
          <LinearGradient colors={['rgba(17,22,42,0.1)', COLORS.sheet]} style={styles.sheetBackdropGradient} />
          <View style={styles.sheetTopRow}>
            <View style={styles.sheetPosterWrap}>
              {posterPath && !posterFailed ? (
                <Image
                  source={{ uri: `${POSTER_URL}${posterPath}` }}
                  style={styles.sheetPoster}
                  resizeMode="cover"
                  onError={() => setPosterFailed(true)}
                />
              ) : (
                <View style={[styles.sheetPoster, styles.sheetPosterFallback]}>
                  <Icon name="film-outline" size={28} color={COLORS.muted} />
                  <Text style={styles.posterFallbackText}>No artwork</Text>
                </View>
              )}
            </View>
            <View style={styles.sheetCopy}>
              <Text style={styles.sectionKicker}>Title signal</Text>
              <Text numberOfLines={3} style={styles.sheetTitle}>{activeMovie ? titleOf(activeMovie) : ''}</Text>
              <View style={styles.featuredMeta}>
                <Text style={styles.matchText}>{activeMovie ? rating(activeMovie) : '—'} ★</Text>
                <Text style={styles.featuredMetaText}>{activeMovie ? yearOf(activeMovie) : '—'}</Text>
                <Text style={styles.featuredMetaText}>{activeMovie ? typeLabel(activeMovie) : 'Film'}</Text>
              </View>
              {detailsLoading ? <ActivityIndicator color={COLORS.lime} size="small" style={styles.sheetDetailsLoading} /> : null}
            </View>
            <Pressable onPress={onClose} style={styles.sheetClose} accessibilityLabel="Close details">
              <Icon name="close" size={20} />
            </Pressable>
          </View>
          {activeMovie?.tagline ? <Text style={styles.sheetTagline}>{activeMovie.tagline}</Text> : null}
          {genreNames.length ? (
            <View style={styles.sheetGenres}>
              {genreNames.map((name) => <Text key={name} style={styles.sheetGenre}>{name}</Text>)}
            </View>
          ) : null}
          <Text style={styles.sheetOverview}>{activeMovie?.overview || 'No synopsis is available for this title yet.'}</Text>
          <ActionButton label="Open player" icon="play" onPress={() => activeMovie && onPlay(activeMovie)} />
        </View>
      </View>
    </Modal>
  );
}

function GenreScreen({
  name,
  movies,
  loading,
  error,
  onBack,
  onRetry,
  onPress,
}: {
  name: string;
  movies: Movie[];
  loading: boolean;
  error: string;
  onBack: () => void;
  onRetry: () => void;
  onPress: (movie: Movie) => void;
}) {
  const emptyComponent = loading ? (
    <ActivityIndicator color={COLORS.lime} style={styles.loadingIndicator} />
  ) : error ? (
    <View style={styles.genreErrorState}>
      <Text style={styles.emptyTitle}>The signal dropped.</Text>
      <Text style={styles.emptyCopy}>{error}</Text>
      <ActionButton label="Try again" icon="refresh" onPress={onRetry} />
    </View>
  ) : (
    <View style={styles.genreErrorState}>
      <Text style={styles.emptyTitle}>No titles found.</Text>
      <Text style={styles.emptyCopy}>There are no titles in this genre right now.</Text>
    </View>
  );

  return (
    <View style={styles.screenFill}>
      <ScreenHeading
        eyebrow="Native genre collection"
        title={name}
        detail="A focused shelf for this signal."
        onBack={onBack}
      />
      <CatalogList
        movies={movies}
        onPress={onPress}
        contentContainerStyle={styles.catalogContent}
        emptyComponent={emptyComponent}
      />
    </View>
  );
}

function BottomNav({ activeTab, onChange }: { activeTab: Tab; onChange: (tab: Tab) => void }) {
  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'films', label: 'Films', icon: 'film' },
    { key: 'series', label: 'Series', icon: 'tv' },
    { key: 'search', label: 'Search', icon: 'search' },
    { key: 'browse', label: 'Browse', icon: 'grid' },
  ];

  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab) => {
        const selected = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={({ pressed }) => [styles.bottomTab, selected && styles.bottomTabActive, pressed && styles.pressed]}
          >
            <Icon name={selected ? tab.icon : `${tab.icon}-outline`} size={19} color={selected ? COLORS.ink : COLORS.muted} />
            <Text style={[styles.bottomTabText, selected && styles.bottomTabTextActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function normalizePlaybackSource(value: unknown): PlaybackSource | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const type = source.type;
  const playbackUrl = source.playbackUrl;
  if (
    typeof source.id !== 'string' ||
    typeof source.label !== 'string' ||
    typeof source.quality !== 'string' ||
    typeof playbackUrl !== 'string' ||
    typeof source.provider !== 'string' ||
    (type !== 'hls' && type !== 'mp4' && type !== 'dash')
  ) {
    return null;
  }

  return {
    id: source.id,
    label: source.label,
    quality: source.quality,
    type,
    playbackUrl,
    provider: source.provider,
  };
}

function normalizePlaybackSubtitle(value: unknown): PlaybackSubtitle | null {
  if (!value || typeof value !== 'object') return null;
  const subtitle = value as Record<string, unknown>;
  if (
    typeof subtitle.id !== 'string' ||
    typeof subtitle.lang !== 'string' ||
    typeof subtitle.language !== 'string' ||
    typeof subtitle.url !== 'string'
  ) {
    return null;
  }

  return {
    id: subtitle.id,
    lang: subtitle.lang,
    language: subtitle.language,
    url: subtitle.url,
  };
}

function NativeVideoSurface({
  movie,
  source,
  onReady,
  onError,
}: {
  movie: Movie;
  source: PlaybackSource;
  onReady: () => void;
  onError: (message: string) => void;
}) {
  const nativeSource = useMemo(
    () => ({
      uri: resolveApiUrl(source.playbackUrl),
      contentType: source.type === 'hls' ? 'hls' as const : source.type === 'dash' ? 'dash' as const : 'progressive' as const,
      metadata: {
        title: titleOf(movie),
        artist: 'SAGE CINEMA',
        artwork: movie.poster_path ? `${POSTER_URL}${movie.poster_path}` : undefined,
      },
    }),
    [movie, source],
  );
  const player = useVideoPlayer(nativeSource, (videoPlayer) => {
    videoPlayer.keepScreenOnWhilePlaying = true;
    videoPlayer.bufferOptions = {
      preferredForwardBufferDuration: 15,
      minBufferForPlayback: 2,
      maxBufferBytes: 16 * 1024 * 1024,
      prioritizeTimeOverSizeThreshold: false,
    };
    videoPlayer.play();
  });

  useEffect(() => {
    const statusSubscription = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'error') {
        onError(error?.message || 'The native player could not load this stream.');
      }
    });
    return () => statusSubscription.remove();
  }, [onError, player]);

  return (
    <VideoView
      style={styles.videoSurface}
      player={player}
      nativeControls
      contentFit="contain"
      surfaceType="surfaceView"
      allowsPictureInPicture={false}
      fullscreenOptions={{ enable: true, orientation: 'landscape' }}
      buttonOptions={{ showSettings: true, showSeekForward: true, showSeekBackward: true }}
      onFirstFrameRender={onReady}
    />
  );
}

function PlayerRelatedCard({
  movie,
  isStudioPick,
  onPress,
}: {
  movie: Movie;
  isStudioPick?: boolean;
  onPress: (movie: Movie) => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`Open ${titleOf(movie)}`}
      onPress={() => onPress(movie)}
      style={({ pressed }) => [styles.playerRelatedCard, pressed && styles.posterPressed]}
    >
      <View style={styles.playerRelatedPoster}>
        {movie.poster_path ? (
          <Image source={{ uri: `${POSTER_URL}${movie.poster_path}` }} style={styles.posterImage} resizeMode="cover" />
        ) : (
          <View style={styles.posterFallback}>
            <Icon name="film-outline" size={24} color={COLORS.muted} />
          </View>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(8,10,18,0.86)']}
          style={styles.posterGradient}
        />
        <View style={styles.playerRelatedPlay}>
          <Icon name="play" size={12} color={COLORS.ink} />
        </View>
        {isStudioPick ? <Text style={styles.studioPickBadge}>Studio pick</Text> : null}
      </View>
      <Text numberOfLines={2} style={styles.playerRelatedTitle}>{titleOf(movie)}</Text>
      <Text style={styles.playerRelatedMeta}>{rating(movie)} ★  ·  {yearOf(movie)}</Text>
    </Pressable>
  );
}

function PlayerShelf({
  kicker,
  title,
  note,
  movies,
  studioMovieIds,
  onPress,
}: {
  kicker: string;
  title: string;
  note: string;
  movies: Movie[];
  studioMovieIds?: Set<number>;
  onPress: (movie: Movie) => void;
}) {
  if (!movies.length) return null;

  return (
    <View style={styles.playerShelfSection}>
      <View style={styles.playerShelfHeading}>
        <View style={styles.shelfHeadingCopy}>
          <Text style={styles.sectionKicker}>{kicker}</Text>
          <Text style={styles.playerShelfTitle}>{title}</Text>
        </View>
        <Text style={styles.playerShelfNote}>{note}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.playerShelfTrack}
      >
        {movies.map((movie) => (
          <PlayerRelatedCard
            key={`${isSeries(movie) ? 'tv' : 'movie'}:${movie.id}`}
            movie={movie}
            isStudioPick={studioMovieIds?.has(movie.id)}
            onPress={onPress}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function NativePlayerScreen({
  movie,
  onClose,
  onSelectMovie,
}: {
  movie: Movie;
  onClose: () => void;
  onSelectMovie: (movie: Movie) => void;
}) {
  const [server, setServer] = useState(PLAYBACK_SERVERS[0]);
  const [requestVersion, setRequestVersion] = useState(0);
  const [sources, setSources] = useState<PlaybackSource[]>([]);
  const [subtitles, setSubtitles] = useState<PlaybackSubtitle[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [loading, setLoading] = useState(true);
  const [sourceError, setSourceError] = useState('');
  const [playerError, setPlayerError] = useState('');
  const [videoReady, setVideoReady] = useState(false);
  const [playerDetails, setPlayerDetails] = useState<Movie>(movie);
  const [relatedMovies, setRelatedMovies] = useState<Movie[]>([]);
  const [studioMovies, setStudioMovies] = useState<Movie[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(true);
  const [relatedError, setRelatedError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const type = isSeries(movie) ? 'tv' : 'movie';

    setPlayerDetails(movie);
    setRelatedMovies([]);
    setStudioMovies([]);
    setRelatedLoading(true);
    setRelatedError('');

    const loadRelated = async () => {
      try {
        const payload = await fetchApiJson<Movie>(`/api/movie/${movie.id}?type=${type}`, { signal: controller.signal });
        if (!active) return;

        const details: Movie = {
          ...movie,
          ...payload,
          genre_ids: payload.genres?.map((genre) => genre.id) || payload.genre_ids || movie.genre_ids || [],
        };
        setPlayerDetails(details);

        const collectionType = type;
        const currentGenre = genreIdsOf(details)[0];
        const studio = details.production_companies?.find((company) => company.name.toLowerCase().includes('vivamax'))
          || details.production_companies?.[0];
        const [generalResponse, genreResponse, studioResponse] = await Promise.all([
          fetchApiJson<{ results?: Movie[] }>(`/${collectionType === 'tv' ? 'api/tv/collection' : 'api/movies/collection'}`, { signal: controller.signal }),
          currentGenre
            ? fetchApiJson<{ results?: Movie[] }>(`/api/movies/genre/${currentGenre}?type=${collectionType}`, { signal: controller.signal })
            : Promise.resolve({ results: [] as Movie[] }),
          studio
            ? fetchApiJson<{ results?: Movie[] }>(`/api/movies/studio/${studio.id}?type=${collectionType}`, { signal: controller.signal })
            : Promise.resolve({ results: [] as Movie[] }),
        ]);
        if (!active) return;

        const normalizedStudioMovies = (studioResponse.results || [])
          .filter((item) => item.id !== details.id)
          .map((item) => ({
            ...item,
            media_type: item.media_type || collectionType,
            production_companies: studio ? [{ id: studio.id, name: studio.name }] : item.production_companies,
          }));
        const combinedPool = [
          ...normalizedStudioMovies,
          ...(genreResponse.results || []),
          ...(generalResponse.results || []),
        ];
        const uniquePool = Array.from(
          new Map(combinedPool.map((item) => [`${isSeries(item) ? 'tv' : 'movie'}:${item.id}`, item])).values(),
        );

        setStudioMovies(Array.from(new Map(normalizedStudioMovies.map((item) => [item.id, item])).values()));
        setRelatedMovies(rankRelatedMovies(details, uniquePool));
      } catch (cause) {
        if (active && !isAbortError(cause)) {
          setRelatedError('Related titles are unavailable right now.');
        }
      } finally {
        if (active) setRelatedLoading(false);
      }
    };

    void loadRelated();
    return () => {
      active = false;
      controller.abort();
    };
  }, [movie]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const type = isSeries(movie) ? 'tv' : 'movie';
    const params = [
      ['player', 'unified'],
      ['server', server],
      ['lang', 'en'],
      ['title', titleOf(movie)],
      ['year', yearOf(movie)],
      ...(isSeries(movie) ? [['season', '1'], ['episode', '1']] : []),
      ...(movie.number_of_seasons ? [['totalSeasons', String(movie.number_of_seasons)]] : []),
    ]
      .filter(([, value]) => value && value !== '—')
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');

    setLoading(true);
    setSourceError('');
    setPlayerError('');
    setSources([]);
    setSubtitles([]);
    setSelectedSourceId('');
    setVideoReady(false);

    fetchApiJson<{ player?: string; sources?: unknown[]; subtitles?: unknown[] }>(
      `/api/video-sources/${type}/${movie.id}?${params}`,
      { signal: controller.signal, timeoutMs: 20_000 },
    )
      .then((payload) => {
        if (payload.player && payload.player !== 'unified') {
          throw new Error('The selected source is not compatible with the native player.');
        }
        const nextSources = (payload.sources || [])
          .map(normalizePlaybackSource)
          .filter((source): source is PlaybackSource => Boolean(source));
        if (!nextSources.length) throw new Error('No playable native streams were found for this title.');
        const nextSubtitles = (payload.subtitles || [])
          .map(normalizePlaybackSubtitle)
          .filter((subtitle): subtitle is PlaybackSubtitle => Boolean(subtitle));
        setSources(nextSources);
        setSubtitles(nextSubtitles);
        setSelectedSourceId(nextSources[0].id);
      })
      .catch((requestError: unknown) => {
        if (!active || isAbortError(requestError)) return;
        if (requestError instanceof Error && requestError.name === 'TimeoutError') {
          setSourceError('The source request timed out. Check your connection and try again.');
        } else {
          setSourceError(requestError instanceof Error ? requestError.message : 'The source service is unavailable.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [movie, requestVersion, server]);

  const selectedSource = sources.find((source) => source.id === selectedSourceId) || sources[0];
  const nextServer = PLAYBACK_SERVERS[(PLAYBACK_SERVERS.indexOf(server) + 1) % PLAYBACK_SERVERS.length];
  const displayError = playerError || sourceError;
  const studioMovieIds = useMemo(() => new Set(studioMovies.map((item) => item.id)), [studioMovies]);
  const exploreMovies = useMemo(() => {
    const nonStudioMovies = relatedMovies.filter((item) => !studioMovieIds.has(item.id));
    return nonStudioMovies.length ? nonStudioMovies : relatedMovies;
  }, [relatedMovies, studioMovieIds]);
  const studioName = playerDetails.production_companies?.find((company) => company.name.toLowerCase().includes('vivamax'))?.name
    || playerDetails.production_companies?.[0]?.name;
  const playerGenres = playerDetails.genres?.map((genre) => genre.name).slice(0, 4) || [];
  const playerStudios = playerDetails.production_companies?.map((company) => company.name).filter(Boolean).slice(0, 3) || [];

  return (
    <View style={styles.playerScreen}>
      <View style={styles.playerHeader}>
        <Pressable onPress={onClose} style={styles.playerBack} accessibilityLabel="Close native player">
          <Icon name="arrow-back" size={21} />
        </Pressable>
        <View style={styles.playerHeaderCopy}>
          <Text style={styles.sectionKicker}>Native screening room</Text>
          <Text numberOfLines={1} style={styles.playerTitle}>{titleOf(movie)}</Text>
        </View>
        <Text style={styles.playerHeaderMeta}>{isSeries(movie) ? 'S1 · E1' : yearOf(movie)}</Text>
      </View>

      {loading ? (
        <View style={styles.playerLoading}>
          <ActivityIndicator color={COLORS.lime} size="large" />
          <Text style={styles.playerLoadingTitle}>Finding a native stream</Text>
          <Text style={styles.mutedText}>Connecting to the {server} source pool…</Text>
        </View>
      ) : displayError && !selectedSource ? (
        <View style={styles.playerErrorState}>
          <View style={styles.emptyIcon}><Icon name="warning-outline" size={29} color={COLORS.pink} /></View>
          <Text style={styles.sectionKicker}>Playback signal lost</Text>
          <Text style={styles.playerErrorTitle}>{displayError}</Text>
          <Text style={styles.playerErrorCopy}>Try the request again or switch to another source pool.</Text>
          <View style={styles.playerErrorActions}>
            <ActionButton label="Retry" icon="refresh" onPress={() => setRequestVersion((value) => value + 1)} />
            <ActionButton label={`Try ${nextServer}`} icon="swap-horizontal" onPress={() => setServer(nextServer)} secondary />
          </View>
        </View>
      ) : selectedSource ? (
        <>
          <View style={styles.videoStage}>
            {playerError ? (
              <View style={styles.videoErrorState}>
                <Icon name="warning-outline" size={28} color={COLORS.pink} />
                <Text style={styles.videoErrorTitle}>This stream stopped loading.</Text>
                <Text style={styles.videoErrorCopy}>{playerError}</Text>
                <Pressable
                  onPress={() => {
                    setPlayerError('');
                    setVideoReady(false);
                    setRequestVersion((value) => value + 1);
                  }}
                  style={styles.playerRetryButton}
                >
                  <Icon name="refresh" size={17} color={COLORS.ink} />
                  <Text style={styles.playerRetryText}>Retry stream</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <NativeVideoSurface
                  key={`${selectedSource.id}-${requestVersion}`}
                  movie={movie}
                  source={selectedSource}
                  onReady={() => setVideoReady(true)}
                  onError={setPlayerError}
                />
                {!videoReady && (
                  <View pointerEvents="none" style={styles.videoLoadingOverlay}>
                    <ActivityIndicator color={COLORS.lime} />
                    <Text style={styles.videoLoadingText}>Buffering native playback…</Text>
                  </View>
                )}
              </>
            )}
          </View>
          <ScrollView
            style={styles.playerBodyScroll}
            contentContainerStyle={styles.playerBodyContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <View style={styles.playerBody}>
              <View style={styles.playerBodyHeading}>
                <View>
                  <Text style={styles.sectionKicker}>Stream quality</Text>
                  <Text style={styles.playerProvider}>{selectedSource.provider}</Text>
                </View>
                <Text style={styles.nativeBadge}>NATIVE</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.qualityTrack}>
                {sources.map((source) => (
                  <Pressable
                    key={source.id}
                    onPress={() => {
                      setSelectedSourceId(source.id);
                      setPlayerError('');
                      setVideoReady(false);
                    }}
                    style={[styles.qualityChip, source.id === selectedSource.id && styles.qualityChipActive]}
                  >
                    <Icon name="play-circle-outline" size={16} color={source.id === selectedSource.id ? COLORS.ink : COLORS.cyan} />
                    <Text style={[styles.qualityChipText, source.id === selectedSource.id && styles.qualityChipTextActive]}>{source.quality}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.playerHint}>
                Native controls provide play, seek, fullscreen, and stream settings. {subtitles.length ? `${subtitles.length} subtitle track${subtitles.length === 1 ? '' : 's'} returned by the API.` : 'No external subtitle tracks were returned for this title.'}
              </Text>

              <View style={styles.playerStoryCard}>
                <Text style={styles.sectionKicker}>The story</Text>
                <Text style={styles.playerStoryTitle}>Stay for the next scene.</Text>
                <Text style={styles.playerStoryCopy}>{playerDetails.overview || 'No synopsis is available for this title yet.'}</Text>
                <View style={styles.playerInfoRows}>
                  <View style={styles.playerInfoRow}>
                    <Text style={styles.playerInfoLabel}>Genres</Text>
                    <Text style={styles.playerInfoValue}>{playerGenres.join(' · ') || '—'}</Text>
                  </View>
                  <View style={styles.playerInfoRow}>
                    <Text style={styles.playerInfoLabel}>Studios</Text>
                    <Text style={styles.playerInfoValue}>{playerStudios.join(' · ') || '—'}</Text>
                  </View>
                </View>
              </View>

              {relatedLoading ? (
                <View style={styles.playerRelatedLoading}>
                  <ActivityIndicator color={COLORS.lime} />
                  <Text style={styles.mutedText}>Curating what to watch next…</Text>
                </View>
              ) : relatedError ? (
                <Text style={styles.playerRelatedError}>{relatedError}</Text>
              ) : (
                <>
                  <PlayerShelf
                    kicker="Keep watching"
                    title="Up next"
                    note={relatedMovies.length ? `${Math.min(relatedMovies.length, 6)} picks` : 'No picks yet'}
                    movies={relatedMovies.slice(0, 6)}
                    studioMovieIds={studioMovieIds}
                    onPress={onSelectMovie}
                  />
                  <PlayerShelf
                    kicker="Behind the frame"
                    title="More in this studio"
                    note={studioName || 'Same production house'}
                    movies={studioMovies.slice(0, 12)}
                    studioMovieIds={studioMovieIds}
                    onPress={onSelectMovie}
                  />
                  <PlayerShelf
                    kicker="Curated next"
                    title="More to explore"
                    note={exploreMovies.length ? `${exploreMovies.length} titles` : 'Keep exploring'}
                    movies={exploreMovies}
                    studioMovieIds={studioMovieIds}
                    onPress={onSelectMovie}
                  />
                </>
              )}
            </View>
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

function CinemaApp() {
  const [collections, setCollections] = useState<Collections>(EMPTY_COLLECTIONS);
  const [genres, setGenres] = useState<Record<number, string>>({});
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedGenreId, setSelectedGenreId] = useState<number | null>(null);
  const [genreMovies, setGenreMovies] = useState<Movie[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const [genreError, setGenreError] = useState('');
  const [genreReloadKey, setGenreReloadKey] = useState(0);
  const [playerMovie, setPlayerMovie] = useState<Movie | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const catalogRequestRef = useRef<AbortController | null>(null);

  const loadCatalog = async (isRefresh = false) => {
    catalogRequestRef.current?.abort();
    const controller = new AbortController();
    catalogRequestRef.current = controller;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const urls = [
        '/api/movies/collection',
        '/api/tv/collection',
        '/api/movies/latest',
        '/api/movies/top-rated',
        '/api/movies/genre/28',
        '/api/anime/collection',
        '/api/genres',
      ];
      const payloads = await Promise.all(urls.map((path) => fetchApiJson<{ results?: Movie[]; genres?: { id: number; name: string }[] }>(path, { signal: controller.signal })));
      if (controller.signal.aborted || catalogRequestRef.current !== controller) return;
      setCollections({
        trending: payloads[0].results || [],
        tv: payloads[1].results || [],
        latest: payloads[2].results || [],
        topRated: payloads[3].results || [],
        action: payloads[4].results || [],
        anime: payloads[5].results || [],
      });
      const nextGenres: Record<number, string> = {};
      (payloads[6].genres || []).forEach((genre: { id: number; name: string }) => {
        nextGenres[genre.id] = genre.name;
      });
      setGenres(nextGenres);
      setError('');
    } catch (cause) {
      if (catalogRequestRef.current === controller && !isAbortError(cause)) {
        setError(cause instanceof Error && cause.name === 'TimeoutError'
          ? 'The cinema signal timed out. Check your connection and try again.'
          : 'The cinema signal is taking a little longer than usual.');
      }
    } finally {
      if (catalogRequestRef.current === controller) {
        catalogRequestRef.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    void loadCatalog();
    return () => catalogRequestRef.current?.abort();
  }, []);

  useEffect(() => {
    const search = query.trim();
    if (activeTab !== 'search' || !search) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const payload = await fetchApiJson<{ results?: Movie[] }>(`/api/search?query=${encodeURIComponent(search)}`, { signal: controller.signal });
        if (active) setSearchResults(payload.results || []);
      } catch (cause) {
        if (active && !isAbortError(cause)) setSearchResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [activeTab, query]);

  useEffect(() => {
    if (activeTab !== 'genre' || selectedGenreId === null) return;

    const controller = new AbortController();
    let active = true;
    setGenreLoading(true);
    setGenreError('');

    fetchApiJson<{ results?: Movie[] }>(`/api/movies/genre/${selectedGenreId}`, { signal: controller.signal })
      .then((payload) => {
        if (active) setGenreMovies(Array.isArray(payload.results) ? payload.results : []);
      })
      .catch((cause) => {
        if (active && !(cause instanceof DOMException && cause.name === 'AbortError')) {
          setGenreMovies([]);
          setGenreError('The genre collection is unavailable right now.');
        }
      })
      .finally(() => {
        if (active) setGenreLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [activeTab, genreReloadKey, selectedGenreId]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (playerMovie) {
        setPlayerMovie(null);
        return true;
      }
      if (selectedMovie) {
        setSelectedMovie(null);
        return true;
      }
      if (activeTab === 'genre') {
        setSelectedGenreId(null);
        setActiveTab('browse');
        return true;
      }
      if (activeTab !== 'home') {
        setActiveTab('home');
        return true;
      }
      return false;
    });

    return () => subscription.remove();
  }, [activeTab, playerMovie, selectedMovie]);

  const featured = useMemo(() => collections.trending[0] || collections.latest[0] || null, [collections]);
  const filmCatalog = useMemo(() => collections.trending.filter((movie) => !isSeries(movie)), [collections]);
  const seriesCatalog = useMemo(() => collections.tv.filter(isSeries), [collections]);

  const openMovie = (movie: Movie) => setSelectedMovie(movie);
  const playMovie = (movie: Movie) => {
    setSelectedMovie(null);
    setPlayerMovie(movie);
  };
  const openPlayerRelatedMovie = (movie: Movie) => {
    setPlayerMovie(null);
    setSelectedMovie(movie);
  };

  const openGenre = (id: number) => {
    setSelectedGenreId(id);
    setActiveTab('genre');
  };

  const closeGenre = () => {
    setSelectedGenreId(null);
    setActiveTab('browse');
  };

  const renderHome = () => (
    <View style={styles.screenFill}>
      <Header onSearch={() => setActiveTab('search')} onBrowse={() => setActiveTab('browse')} />
      <ScrollView
        style={styles.screenFill}
        contentContainerStyle={styles.homeContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadCatalog(true)} tintColor={COLORS.lime} />}
        showsVerticalScrollIndicator={false}
      >
        <Featured movie={featured} onPlay={() => featured && playMovie(featured)} onDetails={() => featured && openMovie(featured)} />
        <View style={styles.introBlock}>
          <Text style={styles.introIndex}>01</Text>
          <View style={styles.introCopy}>
            <Text style={styles.sectionKicker}>A living catalog</Text>
            <Text style={styles.introTitle}>Pick a feeling. <Text style={styles.introAccent}>Find a world.</Text></Text>
            <Text style={styles.introDetail}>Freshly tuned from the movie universe. Move through the shelves and let the next story find you.</Text>
          </View>
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Shelf kicker="The main feature" title="Trending now" note="Most watched" movies={collections.trending} onPress={openMovie} />
        <Shelf kicker="Fresh arrivals" title="New on the reel" note="Just added" movies={collections.latest} onPress={openMovie} />
        <Shelf kicker="Long-form worlds" title="Series to disappear into" note="One more episode" movies={collections.tv} onPress={openMovie} />
        <Shelf kicker="High velocity" title="Turn up the voltage" note="Action" movies={collections.action} onPress={openMovie} />
        <Shelf kicker="Beyond reality" title="Animated dimensions" note="No ceiling" movies={collections.anime} onPress={openMovie} />
      </ScrollView>
    </View>
  );

  const renderCatalog = (kind: 'films' | 'series') => (
    <View style={styles.screenFill}>
      <Header onSearch={() => setActiveTab('search')} onBrowse={() => setActiveTab('browse')} />
      <ScreenHeading
        eyebrow={kind === 'films' ? 'The main feature' : 'Long-form worlds'}
        title={kind === 'films' ? 'Films' : 'Series'}
        detail={kind === 'films' ? 'A full-screen collection for the night.' : 'Stories with room to stay awhile.'}
      />
      <CatalogList
        movies={kind === 'films' ? filmCatalog : seriesCatalog}
        onPress={openMovie}
        contentContainerStyle={styles.catalogContent}
      />
    </View>
  );

  const renderSearch = () => (
    <View style={styles.screenFill}>
      <Header onSearch={() => undefined} onBrowse={() => setActiveTab('browse')} />
      <SearchScreen query={query} setQuery={setQuery} results={searchResults} searching={searching} onPress={openMovie} />
    </View>
  );

  const renderBrowse = () => (
    <View style={styles.screenFill}>
      <Header onSearch={() => setActiveTab('search')} onBrowse={() => undefined} />
      <BrowseScreen genres={genres} onGenre={openGenre} />
    </View>
  );

  const renderGenre = () => (
    <View style={styles.screenFill}>
      <Header onSearch={() => setActiveTab('search')} onBrowse={() => setActiveTab('browse')} />
      <GenreScreen
        name={selectedGenreId === null ? 'Genre' : genres[selectedGenreId] || 'Genre'}
        movies={genreMovies}
        loading={genreLoading}
        error={genreError}
        onBack={closeGenre}
        onRetry={() => setGenreReloadKey((value) => value + 1)}
        onPress={openMovie}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      {playerMovie ? (
        <NativePlayerScreen
          movie={playerMovie}
          onClose={() => setPlayerMovie(null)}
          onSelectMovie={openPlayerRelatedMovie}
        />
      ) : loading ? (
        <View style={styles.loadingScreen}>
          <View style={styles.loadingMark}><Brand /></View>
          <ActivityIndicator color={COLORS.lime} size="small" />
          <Text style={styles.loadingTitle}>Tuning the projector</Text>
          <Text style={styles.mutedText}>Loading the living catalog</Text>
        </View>
      ) : activeTab === 'home' ? renderHome() : activeTab === 'films' ? renderCatalog('films') : activeTab === 'series' ? renderCatalog('series') : activeTab === 'search' ? renderSearch() : activeTab === 'browse' ? renderBrowse() : renderGenre()}
      {!playerMovie && <BottomNav activeTab={activeTab === 'genre' ? 'browse' : activeTab} onChange={setActiveTab} />}
      {!playerMovie && <MovieSheet movie={selectedMovie} genres={genres} onClose={() => setSelectedMovie(null)} onPlay={playMovie} />}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <CinemaApp />
    </SafeAreaProvider>
  );
}

const COLORS = {
  ink: '#080a12',
  panel: '#101427',
  panelRaised: '#151b31',
  sheet: '#11172a',
  paper: '#edf0ff',
  muted: '#9aa6c9',
  line: 'rgba(186,197,255,0.18)',
  lime: '#d7ff61',
  cyan: '#53e5ff',
  violet: '#8b5cff',
  pink: '#ff6fb5',
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.ink },
  playerScreen: { flex: 1, backgroundColor: COLORS.ink },
  playerHeader: { minHeight: 70, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  playerBack: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.panel, alignItems: 'center', justifyContent: 'center' },
  playerHeaderCopy: { flex: 1 },
  playerTitle: { color: COLORS.paper, fontSize: 17, fontWeight: '900', marginTop: 4 },
  playerHeaderMeta: { color: COLORS.cyan, fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  playerLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 10 },
  playerLoadingTitle: { color: COLORS.paper, fontSize: 19, fontWeight: '900', marginTop: 7 },
  playerErrorState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 9 },
  playerErrorTitle: { color: COLORS.paper, fontSize: 20, lineHeight: 24, fontWeight: '900', textAlign: 'center', marginTop: 2 },
  playerErrorCopy: { color: COLORS.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 320 },
  playerErrorActions: { flexDirection: 'row', gap: 9, marginTop: 12 },
  videoStage: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', overflow: 'hidden' },
  videoSurface: { flex: 1, width: '100%' },
  videoLoadingOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,0.48)' },
  videoLoadingText: { color: COLORS.paper, fontSize: 12, fontWeight: '700' },
  videoErrorState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, gap: 8 },
  videoErrorTitle: { color: COLORS.paper, fontSize: 16, fontWeight: '900', textAlign: 'center', marginTop: 3 },
  videoErrorCopy: { color: COLORS.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', maxWidth: 310 },
  playerRetryButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: COLORS.lime, marginTop: 8 },
  playerRetryText: { color: COLORS.ink, fontSize: 12, fontWeight: '900' },
  playerBodyScroll: { flex: 1 },
  playerBodyContent: { paddingBottom: 30 },
  playerBody: { paddingHorizontal: 18, paddingTop: 20 },
  playerBodyHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  playerProvider: { color: COLORS.paper, fontSize: 14, fontWeight: '800', marginTop: 5 },
  nativeBadge: { color: COLORS.ink, backgroundColor: COLORS.lime, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 5, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  qualityTrack: { gap: 8, paddingVertical: 15, alignItems: 'flex-start' },
  qualityChip: { minHeight: 39, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.panel, flexDirection: 'row', alignItems: 'center', gap: 6 },
  qualityChipActive: { borderColor: COLORS.lime, backgroundColor: COLORS.lime },
  qualityChipText: { color: COLORS.paper, fontSize: 12, fontWeight: '900' },
  qualityChipTextActive: { color: COLORS.ink },
  playerHint: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  playerStoryCard: { marginTop: 24, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.panel },
  playerStoryTitle: { color: COLORS.paper, fontSize: 20, lineHeight: 24, fontWeight: '900', letterSpacing: -0.7, marginTop: 7 },
  playerStoryCopy: { color: '#bdc7e2', fontSize: 13, lineHeight: 20, marginTop: 10 },
  playerInfoRows: { marginTop: 15, gap: 11 },
  playerInfoRow: { paddingTop: 11, borderTopWidth: 1, borderTopColor: 'rgba(186,197,255,0.12)', gap: 4 },
  playerInfoLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.3, textTransform: 'uppercase' },
  playerInfoValue: { color: '#dce2fb', fontSize: 12, lineHeight: 18 },
  playerRelatedLoading: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: 9 },
  playerRelatedError: { color: COLORS.muted, fontSize: 12, lineHeight: 18, paddingVertical: 22, textAlign: 'center' },
  playerShelfSection: { marginTop: 29 },
  playerShelfHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 13 },
  playerShelfTitle: { color: COLORS.paper, fontSize: 24, lineHeight: 27, fontWeight: '900', letterSpacing: -1.1, marginTop: 6 },
  playerShelfNote: { color: COLORS.muted, fontSize: 10, paddingBottom: 2, textAlign: 'right', maxWidth: 125 },
  playerShelfTrack: { gap: 11, paddingBottom: 3 },
  playerRelatedCard: { width: 116 },
  playerRelatedPoster: { width: 116, height: 174, overflow: 'hidden', borderRadius: 9, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.panelRaised, position: 'relative' },
  playerRelatedPlay: { position: 'absolute', bottom: 8, left: 8, width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.lime },
  studioPickBadge: { position: 'absolute', right: 6, bottom: 7, maxWidth: 76, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 5, color: COLORS.ink, backgroundColor: COLORS.lime, fontSize: 8, fontWeight: '900' },
  playerRelatedTitle: { color: '#e2e6ff', fontSize: 12, lineHeight: 16, fontWeight: '800', marginTop: 8 },
  playerRelatedMeta: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  screenFill: { flex: 1 },
  homeContent: { paddingBottom: 36 },
  catalogContent: { paddingHorizontal: 18, paddingBottom: 36 },
  searchScreen: { flex: 1, paddingHorizontal: 18 },
  searchResultsContent: { flexGrow: 1, paddingBottom: 36 },
  browseContent: { paddingHorizontal: 18, paddingBottom: 36 },
  header: { minHeight: 64, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', gap: 9 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandOrbit: { width: 26, height: 26, borderWidth: 1, borderColor: COLORS.lime, borderRadius: 15, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-28deg' }] },
  brandOrbitDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: COLORS.lime, shadowColor: COLORS.lime, shadowOpacity: 0.8, shadowRadius: 7 },
  brandName: { color: COLORS.paper, fontWeight: '900', fontSize: 13, letterSpacing: 2.2 },
  brandSub: { color: COLORS.cyan, fontWeight: '800', fontSize: 8, letterSpacing: 3.3, marginTop: 1 },
  iconButton: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: 'rgba(16,20,39,0.86)', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  featured: { height: 476, marginHorizontal: 12, borderRadius: 25, overflow: 'hidden', backgroundColor: COLORS.panel, position: 'relative', borderWidth: 1, borderColor: 'rgba(186,197,255,0.14)' },
  featuredBackdrop: { opacity: 0.9 },
  featuredGrid: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  featuredCopy: { position: 'absolute', top: 26, left: 22, width: '64%', zIndex: 2 },
  signalLabel: { color: COLORS.lime, fontSize: 10, letterSpacing: 1.2, fontWeight: '900' },
  featuredTitle: { color: COLORS.paper, fontSize: 42, lineHeight: 43, fontWeight: '900', letterSpacing: -2.2, marginTop: 15 },
  featuredMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 9, marginTop: 13 },
  matchText: { color: COLORS.lime, fontSize: 12, fontWeight: '900' },
  featuredMetaText: { color: '#c4cceb', fontSize: 12, fontWeight: '600' },
  featuredOverview: { color: '#b8c3e0', fontSize: 13, lineHeight: 19, marginTop: 14 },
  featuredActions: { flexDirection: 'row', gap: 8, marginTop: 18 },
  actionButton: { minHeight: 45, paddingHorizontal: 15, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionButtonPrimary: { backgroundColor: COLORS.lime },
  actionButtonSecondary: { backgroundColor: 'rgba(16,20,39,0.78)', borderWidth: 1, borderColor: COLORS.line },
  actionButtonText: { color: COLORS.ink, fontSize: 13, fontWeight: '900' },
  actionButtonTextSecondary: { color: COLORS.paper },
  featuredPosterWrap: { position: 'absolute', right: -4, bottom: 45, width: 142, height: 214, transform: [{ rotate: '5deg' }], zIndex: 1 },
  featuredPoster: { width: '100%', height: '100%', borderRadius: 7, borderWidth: 1, borderColor: 'rgba(237,240,255,0.65)', backgroundColor: COLORS.panelRaised },
  nowPlayingBadge: { position: 'absolute', bottom: 10, left: 9, backgroundColor: COLORS.lime, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 5 },
  nowPlayingText: { color: COLORS.ink, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  featuredFooter: { position: 'absolute', left: 20, right: 20, bottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveSignal: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.pink },
  featuredFooterText: { color: '#8792b4', fontSize: 9, letterSpacing: 0.7, textTransform: 'uppercase', fontWeight: '800' },
  featuredLoading: { height: 476, marginHorizontal: 12, borderRadius: 25, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: COLORS.panel },
  mutedText: { color: COLORS.muted, fontSize: 12 },
  introBlock: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 38, paddingBottom: 42, gap: 14 },
  introIndex: { color: COLORS.violet, fontSize: 15, fontWeight: '900', letterSpacing: 1, paddingTop: 2 },
  introCopy: { flex: 1 },
  sectionKicker: { color: COLORS.lime, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase' },
  introTitle: { color: COLORS.paper, fontSize: 34, lineHeight: 36, fontWeight: '900', letterSpacing: -1.7, marginTop: 8 },
  introAccent: { color: COLORS.cyan },
  introDetail: { color: '#a0a9c9', fontSize: 14, lineHeight: 22, marginTop: 13, maxWidth: 330 },
  errorText: { color: COLORS.pink, marginHorizontal: 20, marginBottom: 22, fontSize: 12, lineHeight: 18 },
  shelfSection: { marginBottom: 40 },
  shelfHeading: { paddingHorizontal: 20, marginBottom: 13, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 },
  shelfHeadingCopy: { flex: 1 },
  shelfTitle: { color: COLORS.paper, fontSize: 25, lineHeight: 27, fontWeight: '900', letterSpacing: -1.2, marginTop: 6 },
  shelfNote: { color: COLORS.muted, fontSize: 11, paddingBottom: 2, textAlign: 'right' },
  shelfTrack: { gap: 12, paddingHorizontal: 20, paddingBottom: 4 },
  posterCard: { width: 137 },
  posterPressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  posterFrame: { width: 137, height: 205, overflow: 'hidden', borderRadius: 9, backgroundColor: COLORS.panelRaised, borderWidth: 1, borderColor: COLORS.line, position: 'relative' },
  posterImage: { width: '100%', height: '100%' },
  posterGradient: { position: 'absolute', right: 0, bottom: 0, left: 0, top: '45%' },
  posterFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: COLORS.panelRaised },
  posterFallbackText: { color: COLORS.muted, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  ratingPill: { position: 'absolute', top: 8, right: 7, flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 7, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(8,10,18,0.72)' },
  ratingText: { color: COLORS.lime, fontSize: 10, fontWeight: '900' },
  posterPlay: { position: 'absolute', bottom: 9, left: 9, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.lime },
  posterTitle: { color: '#e2e6ff', fontSize: 13, fontWeight: '800', marginTop: 9 },
  posterMeta: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  screenHeading: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 23 },
  screenBack: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 17 },
  screenBackText: { color: COLORS.cyan, fontSize: 11, fontWeight: '800' },
  screenTitle: { color: COLORS.paper, fontSize: 40, lineHeight: 41, fontWeight: '900', letterSpacing: -2, marginTop: 9 },
  screenDetail: { color: COLORS.muted, fontSize: 14, lineHeight: 20, marginTop: 10 },
  catalogRow: { flexDirection: 'row', gap: 12 },
  catalogCell: { flex: 1 },
  searchField: { minHeight: 56, paddingHorizontal: 14, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(83,229,255,0.45)', backgroundColor: 'rgba(5,8,17,0.84)', flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
  searchInput: { flex: 1, color: COLORS.paper, fontSize: 16, paddingVertical: 0 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 65 },
  emptyIcon: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(83,229,255,0.35)', backgroundColor: 'rgba(83,229,255,0.07)', marginBottom: 18 },
  emptyTitle: { color: COLORS.paper, fontSize: 25, fontWeight: '900', letterSpacing: -1, marginTop: 10, textAlign: 'center' },
  emptyCopy: { color: COLORS.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 310 },
  genreGrid: { gap: 10 },
  genreChip: { minHeight: 58, borderRadius: 16, borderWidth: 1, borderColor: COLORS.line, backgroundColor: 'rgba(16,20,39,0.78)', paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  genreChipPressed: { borderColor: COLORS.lime, backgroundColor: 'rgba(215,255,97,0.12)' },
  genreChipText: { color: COLORS.paper, fontSize: 15, fontWeight: '800' },
  loadingIndicator: { marginTop: 45 },
  bottomNav: { minHeight: 64, marginHorizontal: 10, marginTop: 8, paddingTop: 6, paddingBottom: 7, paddingHorizontal: 6, borderRadius: 21, flexDirection: 'row', backgroundColor: 'rgba(10,14,27,0.94)', borderWidth: 1, borderColor: COLORS.line, shadowColor: '#000', shadowOpacity: 0.42, shadowRadius: 25, elevation: 14 },
  bottomTab: { flex: 1, minHeight: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 3 },
  bottomTabActive: { backgroundColor: COLORS.lime },
  bottomTabText: { color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  bottomTabTextActive: { color: COLORS.ink },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingMark: { marginBottom: 8, transform: [{ scale: 1.18 }] },
  loadingTitle: { color: COLORS.paper, fontSize: 18, fontWeight: '900', marginTop: 6 },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  movieSheet: { minHeight: 390, padding: 20, paddingTop: 28, borderTopLeftRadius: 27, borderTopRightRadius: 27, overflow: 'hidden', backgroundColor: COLORS.sheet, borderTopWidth: 1, borderColor: 'rgba(186,197,255,0.2)' },
  sheetHandle: { position: 'absolute', top: 10, left: '43%', width: 50, height: 4, borderRadius: 4, backgroundColor: 'rgba(237,240,255,0.28)' },
  sheetBackdrop: { position: 'absolute', top: 0, right: 0, left: 0, height: 175, opacity: 0.42 },
  sheetBackdropGradient: { position: 'absolute', top: 0, right: 0, left: 0, height: 205 },
  sheetTopRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  sheetPosterWrap: { width: 86, height: 128 },
  sheetPoster: { width: '100%', height: '100%', borderRadius: 8, backgroundColor: COLORS.panelRaised },
  sheetPosterFallback: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  sheetCopy: { flex: 1, paddingTop: 8 },
  sheetDetailsLoading: { alignSelf: 'flex-start', marginTop: 12 },
  sheetTitle: { color: COLORS.paper, fontSize: 27, lineHeight: 29, fontWeight: '900', letterSpacing: -1.2, marginTop: 7 },
  sheetClose: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,20,39,0.7)' },
  sheetTagline: { color: COLORS.cyan, fontSize: 12, lineHeight: 18, fontStyle: 'italic', marginTop: 18 },
  sheetGenres: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  sheetGenre: { color: COLORS.muted, fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(83,229,255,0.22)', backgroundColor: 'rgba(83,229,255,0.06)' },
  sheetOverview: { color: '#bdc7e2', fontSize: 14, lineHeight: 21, marginTop: 22, marginBottom: 20 },
  genreErrorState: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 60, gap: 10 },
});
