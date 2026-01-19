using System;
using System.Collections.Generic;

namespace Kanban.Entities;

public partial class Userverification
{
    public long Id { get; set; }

    public string? Code { get; set; }

    public DateTime ExpiresAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public bool IsUsed { get; set; }

    public string Email { get; set; } = null!;
}
