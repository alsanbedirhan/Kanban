using System;
using System.Collections.Generic;

namespace Kanban.Entities;

public partial class UserNote
{
    public long Id { get; set; }

    public string? Note { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public long UserId { get; set; }

    public string? Title { get; set; }

    public bool IsDeleted { get; set; }

    public virtual User User { get; set; } = null!;
}
