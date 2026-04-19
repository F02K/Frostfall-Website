async function loadDiscordWidget() {
  try {
    const res = await fetch("https://discord.com/api/guilds/1494021755210039387/widget.json");
    if (!res.ok) return;
    const data = await res.json();
    const onlineEl = document.getElementById("discord-online");
    const membersEl = document.getElementById("discord-members");
    if (onlineEl) onlineEl.textContent = data.presence_count ?? "?";
    if (membersEl) {
      const inv = await fetch("https://discord.com/api/v10/invites/GNzwPx8k?with_counts=true");
      if (inv.ok) {
        const invData = await inv.json();
        membersEl.textContent = invData.approximate_member_count ?? "?";
      }
    }
  } catch (_) {}
}

loadDiscordWidget();
