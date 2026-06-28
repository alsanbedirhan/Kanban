namespace Kanban.Security
{
    public static class AvatarNames
    {
        private static readonly HashSet<string> Allowed = new(StringComparer.OrdinalIgnoreCase)
        {
            "def",
            "Abby", "Aiden", "Aneka", "Axel", "Bear", "Bella", "Brian", "Bubba", "Caleb", "Christopher", "Coco", "Cookie",
            "Daisy", "Easton", "Elsie", "Felix", "Finn", "Gizmo", "Hazel", "Hunter", "Jack", "Jasper", "Julia", "Lucky",
            "Luna", "Lydia", "Mason", "Maya", "Midnight", "Molly", "Nolan", "Oscar", "Pepper", "Rocky", "Scooter", "Shadow",
            "Sophie", "Sparky", "Willow", "Zoe"
        };

        public static bool IsAllowed(string? avatar) =>
            !string.IsNullOrWhiteSpace(avatar) && Allowed.Contains(avatar.Trim());

        public static string Normalize(string? avatar, string fallback = "Felix") =>
            IsAllowed(avatar) ? avatar!.Trim() : fallback;
    }
}
