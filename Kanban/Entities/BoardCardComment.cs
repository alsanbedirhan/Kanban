using System;
using System.Collections.Generic;

namespace Kanban.Entities;

public partial class BoardCardComment
{
    public long Id { get; set; }

    public DateTime CreatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public string Message { get; set; } = null!;

    public long UserId { get; set; }

    public long BoardCardId { get; set; }

    public virtual BoardCard BoardCard { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
