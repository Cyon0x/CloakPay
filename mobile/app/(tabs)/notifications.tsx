import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Icon } from "../../src/components/Icon";
import { Button, Card, EmptyState, Loading, Notice } from "../../src/components/ui";
import { notificationAge, notificationKindIcon, useNotifications, type AppNotification } from "../../src/notifications";
import { color, radius, space, type } from "../../src/theme";

/**
 * The notification inbox.
 *
 * This is a tab of its own rather than a section buried in Settings: unread
 * state, the list and "mark all read" are the whole point of the screen. A row
 * becomes read when it is opened, and opening it takes the person to Activity,
 * where the payment it describes is listed.
 */
export default function Notifications() {
  const router = useRouter();
  const { notifications, unread, state, markingAll, refresh, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [refreshing, setRefreshing] = useState(false);
  const visible = filter === "unread" ? notifications.filter((item) => !item.read_at) : notifications;

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  function openNotification(item: AppNotification) {
    void markRead(item.id);
    router.push("/activity");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.slate500} />}
      >
        <View style={styles.head}>
          <View style={styles.headCopy}>
            <Text style={styles.title}>Notifications</Text>
            <Text style={styles.sub}>
              Payments, confirmations and account updates. Previews never include an amount.
            </Text>
          </View>
          <View style={styles.countPill} accessibilityLabel={`${unread} unread notifications`}>
            <View style={[styles.countDot, unread === 0 && styles.countDotQuiet]} />
            <Text style={styles.countText}>{unread === 0 ? "All read" : `${unread} unread`}</Text>
          </View>
        </View>

        <View style={styles.toolbar}>
          <View style={styles.segmented} accessibilityRole="tablist">
            <Pressable
              onPress={() => setFilter("all")}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === "all" }}
              style={[styles.segment, filter === "all" && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, filter === "all" && styles.segmentTextActive]}>All</Text>
              <Text style={[styles.segmentCount, filter === "all" && styles.segmentTextActive]}>{notifications.length}</Text>
            </Pressable>
            <Pressable
              onPress={() => setFilter("unread")}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === "unread" }}
              style={[styles.segment, filter === "unread" && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, filter === "unread" && styles.segmentTextActive]}>Unread</Text>
              <Text style={[styles.segmentCount, filter === "unread" && styles.segmentTextActive]}>{unread}</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => void markAllRead()}
            disabled={markingAll || unread === 0}
            accessibilityRole="button"
            style={styles.markAll}
          >
            <Text style={[styles.markAllText, (markingAll || unread === 0) && styles.markAllDisabled]}>
              {markingAll ? "Marking…" : unread === 0 ? "All read" : "Mark all read"}
            </Text>
          </Pressable>
        </View>

        {state === "loading" ? (
          <View style={styles.loading}>
            <Loading label="Loading notifications" />
          </View>
        ) : state === "error" ? (
          <View style={styles.block}>
            <Notice tone="error" title={"Couldn't load notifications"}>
              Check your connection and try again. Your payment history is unaffected.
            </Notice>
            <Button title="Try again" variant="secondary" onPress={() => void refresh()} style={styles.retry} />
          </View>
        ) : visible.length === 0 ? (
          <View style={styles.block}>
            <EmptyState
              title={filter === "unread" ? "Nothing unread" : "You're all caught up"}
              body={
                filter === "unread"
                  ? "Every notification has been read. Switch back to All to look through earlier ones."
                  : "Payments and confirmations for your username will appear here."
              }
            />
          </View>
        ) : (
          <Card style={styles.card}>
            {visible.map((item, index) => (
              <Pressable
                key={item.id}
                onPress={() => openNotification(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}${item.read_at ? "" : ", unread"}`}
                style={[styles.row, index > 0 && styles.divider]}
              >
                <View style={[styles.iconWrap, !item.read_at && styles.iconWrapUnread]}>
                  <Icon name={notificationKindIcon(item.kind)} size={18} color={color.ink900} strokeWidth={1.7} />
                </View>
                <View style={styles.rowCopy}>
                  <View style={styles.rowTitleLine}>
                    {!item.read_at ? <View style={styles.unreadDot} /> : null}
                    <Text style={styles.rowTitle}>{item.title}</Text>
                  </View>
                  {item.body ? <Text style={styles.rowBody}>{item.body}</Text> : null}
                  <Text style={styles.rowTime}>{notificationAge(item.created_at)}</Text>
                </View>
                <Icon name="chevronRight" size={16} color={color.slate400} strokeWidth={1.8} />
              </Pressable>
            ))}
          </Card>
        )}

        <Text style={styles.footnote}>
          Notifications are recorded by CloakPay itself. Amounts are kept out of the preview so a lock-screen
          alert cannot expose a payment.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper50 },
  body: { padding: space.xl, paddingBottom: 120, gap: space.sm },
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.md },
  headCopy: { flex: 1, minWidth: 0 },
  title: { ...type.title, color: color.ink950 },
  sub: { ...type.small, color: color.slate600, marginTop: 6 },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: color.glassBorder,
    borderRadius: radius.pill,
    backgroundColor: color.glassSoft,
  },
  countDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.ink900 },
  countDotQuiet: { backgroundColor: color.ok600 },
  countText: { ...type.tiny, color: color.slate600, fontWeight: "500" },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, marginTop: space.lg },
  segmented: {
    flexDirection: "row",
    gap: 2,
    padding: 3,
    borderWidth: 1,
    borderColor: color.glassBorder,
    borderRadius: radius.pill,
    backgroundColor: color.glassSoft,
  },
  segment: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 13, paddingVertical: 10, borderRadius: radius.pill },
  segmentActive: { backgroundColor: color.paper0 },
  segmentText: { fontSize: 12.5, fontWeight: "500", color: color.slate600 },
  segmentTextActive: { color: color.ink950, fontWeight: "600" },
  segmentCount: { fontSize: 10.5, color: color.slate500, fontVariant: ["tabular-nums"] },
  markAll: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  markAllText: { fontSize: 12.5, fontWeight: "600", color: color.ink900 },
  markAllDisabled: { color: color.slate400 },
  loading: { paddingVertical: space.xxl },
  block: { marginTop: space.lg, gap: space.md },
  retry: { alignSelf: "flex-start" },
  card: { marginTop: space.lg, padding: 6 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingVertical: space.md, paddingHorizontal: 8 },
  divider: { borderTopWidth: 1, borderTopColor: color.glassBorder },
  iconWrap: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: color.glassBorder,
    borderRadius: 12,
    backgroundColor: color.glassSoft,
  },
  iconWrapUnread: { backgroundColor: color.paper0 },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.ink950 },
  rowTitle: { fontSize: 14, fontWeight: "600", color: color.ink900, flexShrink: 1 },
  rowBody: { ...type.tiny, lineHeight: 18, color: color.slate600 },
  rowTime: { ...type.tiny, color: color.slate500, marginTop: 2 },
  footnote: { ...type.tiny, color: color.slate500, lineHeight: 18, marginTop: space.lg },
});
