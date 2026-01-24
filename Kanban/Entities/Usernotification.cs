using System;
using System.Collections.Generic;

namespace Kanban.Entities;

public partial class Usernotification
{
    public long Id { get; set; }

    public DateTime CreatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public string Message { get; set; } = null!;

    public long UserId { get; set; }

    public virtual User User { get; set; } = null!;
}
