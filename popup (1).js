chrome.storage.local.get(["orbit_contacts"], (res) => {
  const contacts = res.orbit_contacts || [];
  const cold = contacts.filter(c => {
    const days = Math.floor((Date.now() - new Date(c.date)) / 86400000);
    return days > 30;
  });
  document.getElementById("total").textContent = contacts.length;
  document.getElementById("cold").textContent = cold.length;
});

document.getElementById("open-linkedin").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://www.linkedin.com" });
});
