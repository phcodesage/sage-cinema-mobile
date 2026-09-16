import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
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
  media_type?: string;
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

type Tab = 'home' | 'films' | 'series' | 'search' | 'browse';

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

function resolveApiUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_URL}${value.startsWith('/') ? '' : '/'}${value}`;
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

function CatalogGrid({ movies, onPress }: { movies: Movie[]; onPress: (movie: Movie) => void }) {
  const rows: Movie[][] = [];
  for (let i = 0; i < movies.length; i += 2) rows.push(movies.slice(i, i + 2));

  return (
    <View style={styles.catalogGrid}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.catalogRow}>
          {row.map((movie) => (
            <View key={movie.id} style={styles.catalogCell}>
              <PosterCard movie={movie} onPress={onPress} />
            </View>
          ))}
          {row.length === 1 && <View style={styles.catalogCell} />}
        </View>
      ))}
    </View>
  );
}

function ScreenHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <View style={styles.screenHeading}>
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
      <ScrollView
        style={styles.screenFill}
        contentContainerStyle={styles.searchResultsContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {query && results.length ? (
          <CatalogGrid movies={results} onPress={onPress} />
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}><Icon name={query ? 'film-outline' : 'search-outline'} size={30} color={COLORS.cyan} /></View>
            <Text style={styles.sectionKicker}>{query ? 'No matches yet' : 'Open the catalog'}</Text>
            <Text style={styles.emptyTitle}>{query ? 'Nothing in this signal.' : 'What are you in the mood for?'}</Text>
            <Text style={styles.emptyCopy}>{query ? 'Try another title, spelling, or platform.' : 'Search by title, series, or platform and we’ll bring the screening room to you.'}</Text>
          </View>
        )}
      </ScrollView>
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

function MovieSheet({ movie, onClose, onPlay }: { movie: Movie | null; onClose: () => void; onPlay: (movie: Movie) => void }) {
  return (
    <Modal visible={Boolean(movie)} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close details" />
        <View style={styles.movieSheet}>
          <View style={styles.sheetHandle} />
          {movie?.backdrop_path && (
            <Image source={{ uri: `${BACKDROP_URL}${movie.backdrop_path}` }} style={styles.sheetBackdrop} />
          )}
          <LinearGradient colors={['rgba(17,22,42,0.1)', COLORS.sheet]} style={styles.sheetBackdropGradient} />
          <View style={styles.sheetTopRow}>
            <View style={styles.sheetPosterWrap}>
              {movie?.poster_path ? <Image source={{ uri: `${POSTER_URL}${movie.poster_path}` }} style={styles.sheetPoster} /> : null}
            </View>
            <View style={styles.sheetCopy}>
              <Text style={styles.sectionKicker}>Title signal</Text>
              <Text numberOfLines={3} style={styles.sheetTitle}>{movie ? titleOf(movie) : ''}</Text>
              <View style={styles.featuredMeta}>
                <Text style={styles.matchText}>{movie ? rating(movie) : '—'} ★</Text>
                <Text style={styles.featuredMetaText}>{movie ? yearOf(movie) : '—'}</Text>
                <Text style={styles.featuredMetaText}>{movie ? typeLabel(movie) : 'Film'}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={styles.sheetClose} accessibilityLabel="Close details">
              <Icon name="close" size={20} />
            </Pressable>
          </View>
          <Text style={styles.sheetOverview}>{movie?.overview || 'No synopsis is available for this title yet.'}</Text>
          <ActionButton label="Open player" icon="play" onPress={() => movie && onPlay(movie)} />
        </View>
      </View>
    </Modal>
  );
}

function BottomNav({ activeTab, onChange }: { activeTab: Tab; onChange: (tab: Tab) => void }) {
  const insets = useSafeAreaInsets();
  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'films', label: 'Films', icon: 'film' },
    { key: 'series', label: 'Series', icon: 'tv' },
    { key: 'search', label: 'Search', icon: 'search' },
    { key: 'browse', label: 'Browse', icon: 'grid' },
  ];

  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 7) }]}>
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

function NativePlayerScreen({ movie, onClose }: { movie: Movie; onClose: () => void }) {
  const [server, setServer] = useState(PLAYBACK_SERVERS[0]);
  const [requestVersion, setRequestVersion] = useState(0);
  const [sources, setSources] = useState<PlaybackSource[]>([]);
  const [subtitles, setSubtitles] = useState<PlaybackSubtitle[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [loading, setLoading] = useState(true);
  const [sourceError, setSourceError] = useState('');
  const [playerError, setPlayerError] = useState('');
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
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

    fetch(`${API_URL}/api/video-sources/${type}/${movie.id}?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { player?: string; sources?: unknown[]; subtitles?: unknown[]; error?: string };
        if (!response.ok) throw new Error(payload.error || 'The source service returned an error.');
        return payload;
      })
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
        if (controller.signal.aborted) {
          setSourceError('The source request timed out. Check your connection and try again.');
        } else {
          setSourceError(requestError instanceof Error ? requestError.message : 'The source service is unavailable.');
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        setLoading(false);
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [movie, requestVersion, server]);

  const selectedSource = sources.find((source) => source.id === selectedSourceId) || sources[0];
  const nextServer = PLAYBACK_SERVERS[(PLAYBACK_SERVERS.indexOf(server) + 1) % PLAYBACK_SERVERS.length];
  const displayError = playerError || sourceError;

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
          </View>
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
  const [playerMovie, setPlayerMovie] = useState<Movie | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadCatalog = async (isRefresh = false) => {
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
      const responses = await Promise.all(urls.map((path) => fetch(`${API_URL}${path}`)));
      if (responses.some((response) => !response.ok)) throw new Error('Catalog request failed');
      const payloads = await Promise.all(responses.map((response) => response.json()));
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
    } catch {
      setError('The cinema signal is taking a little longer than usual.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

  useEffect(() => {
    const search = query.trim();
    if (activeTab !== 'search' || !search) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${API_URL}/api/search?query=${encodeURIComponent(search)}`);
        const payload = response.ok ? await response.json() : { results: [] };
        if (active) setSearchResults(payload.results || []);
      } catch {
        if (active) setSearchResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [activeTab, query]);

  const featured = useMemo(() => collections.trending[0] || collections.latest[0] || null, [collections]);
  const filmCatalog = useMemo(() => collections.trending.filter((movie) => !isSeries(movie)), [collections]);
  const seriesCatalog = useMemo(() => collections.tv.filter(isSeries), [collections]);

  const openMovie = (movie: Movie) => setSelectedMovie(movie);
  const playMovie = (movie: Movie) => {
    setSelectedMovie(null);
    setPlayerMovie(movie);
  };

  const onGenre = (id: number) => {
    void Linking.openURL(`${API_URL}/genre/${id}`);
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
      <ScrollView style={styles.screenFill} contentContainerStyle={styles.catalogContent} showsVerticalScrollIndicator={false}>
        <CatalogGrid movies={kind === 'films' ? filmCatalog : seriesCatalog} onPress={openMovie} />
      </ScrollView>
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
      <BrowseScreen genres={genres} onGenre={onGenre} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={playerMovie ? ['top', 'bottom'] : ['top']}>
      <StatusBar style="light" />
      {playerMovie ? (
        <NativePlayerScreen movie={playerMovie} onClose={() => setPlayerMovie(null)} />
      ) : loading ? (
        <View style={styles.loadingScreen}>
          <View style={styles.loadingMark}><Brand /></View>
          <ActivityIndicator color={COLORS.lime} size="small" />
          <Text style={styles.loadingTitle}>Tuning the projector</Text>
          <Text style={styles.mutedText}>Loading the living catalog</Text>
        </View>
      ) : activeTab === 'home' ? renderHome() : activeTab === 'films' ? renderCatalog('films') : activeTab === 'series' ? renderCatalog('series') : activeTab === 'search' ? renderSearch() : renderBrowse()}
      {!playerMovie && <BottomNav activeTab={activeTab} onChange={setActiveTab} />}
      {!playerMovie && <MovieSheet movie={selectedMovie} onClose={() => setSelectedMovie(null)} onPlay={playMovie} />}
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
  playerBody: { flex: 1, paddingHorizontal: 18, paddingTop: 20 },
  playerBodyHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  playerProvider: { color: COLORS.paper, fontSize: 14, fontWeight: '800', marginTop: 5 },
  nativeBadge: { color: COLORS.ink, backgroundColor: COLORS.lime, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 5, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  qualityTrack: { gap: 8, paddingVertical: 15, alignItems: 'flex-start' },
  qualityChip: { minHeight: 39, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.panel, flexDirection: 'row', alignItems: 'center', gap: 6 },
  qualityChipActive: { borderColor: COLORS.lime, backgroundColor: COLORS.lime },
  qualityChipText: { color: COLORS.paper, fontSize: 12, fontWeight: '900' },
  qualityChipTextActive: { color: COLORS.ink },
  playerHint: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
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
  screenTitle: { color: COLORS.paper, fontSize: 40, lineHeight: 41, fontWeight: '900', letterSpacing: -2, marginTop: 9 },
  screenDetail: { color: COLORS.muted, fontSize: 14, lineHeight: 20, marginTop: 10 },
  catalogGrid: { gap: 18 },
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
  bottomNav: { minHeight: 64, marginHorizontal: 10, marginTop: 8, borderRadius: 21, paddingTop: 6, paddingHorizontal: 6, flexDirection: 'row', backgroundColor: 'rgba(10,14,27,0.94)', borderWidth: 1, borderColor: COLORS.line, shadowColor: '#000', shadowOpacity: 0.42, shadowRadius: 25, elevation: 14 },
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
  sheetCopy: { flex: 1, paddingTop: 8 },
  sheetTitle: { color: COLORS.paper, fontSize: 27, lineHeight: 29, fontWeight: '900', letterSpacing: -1.2, marginTop: 7 },
  sheetClose: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,20,39,0.7)' },
  sheetOverview: { color: '#bdc7e2', fontSize: 14, lineHeight: 21, marginTop: 22, marginBottom: 20 },
});
